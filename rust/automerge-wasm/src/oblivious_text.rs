//! Oblivious Text CRDT — element-ID-based RGA with Euler Tour materialization.
//!
//! Two parallel structures:
//! - `CleartextOp`: structural metadata for sync protocol (never enters cmov/sort)
//! - `ObliviousElement`: encrypted fields for CRDT operations (the only thing in cmov/sort)
//!
//! Materialization uses Euler Tour + pointer jumping for O(N log³N) DFS ordering.
//!
//! All sort keys and satellite data are packed into composite ObliviousByteArrays
//! so that entries are opaque same-size blobs. Field sizes:
//!   - ID fields (elem_id, edge_id, sort_key, etc.): 32 bytes
//!   - Int fields (index, type, weight, etc.): 5 bytes (validity + big-endian i32)
//!   - Bool fields (tombstone, is_down, etc.): 1 byte (ObliviousBool)

use wasm_bindgen::prelude::*;

use crate::oblivious_dom;
use crate::oblivious_sort::{bitonic_sort, pad_to_power_of_2, SortEntry};

const ID_SIZE: u32 = 32;
const INT_SIZE: u32 = 5;

// ── Cleartext structure (never enters cmov/sort) ─────────────────────

/// Structural metadata for sync. Indexed in parallel with ObliviousElement.
#[derive(Clone, Debug)]
pub struct CleartextOp {
    pub lamport: u64,
    pub actor: String,
    pub op_id: u64,
    pub obj: String,
    pub insert: bool,
}

// ── Oblivious structure (the only thing in cmov/sort) ────────────────

/// Encrypted element. All fields are JsValue references to oblivious DOM objects.
#[derive(Clone, Debug)]
pub struct ObliviousElement {
    /// Encrypted element identity (ObliviousByteArray, 32 bytes).
    pub elem_id: JsValue,
    /// Encrypted predecessor identity (ObliviousByteArray, 32 bytes).
    pub predecessor_id: JsValue,
    /// Encrypted character value (ObliviousByteArray: validity + utf16).
    pub value: JsValue,
    /// Encrypted tombstone flag (ObliviousBool, 1 byte).
    pub tombstone: JsValue,
    /// Encrypted sort key for sibling ordering (ObliviousByteArray, 32 bytes).
    pub sort_key: JsValue,
}

// ── The CRDT ─────────────────────────────────────────────────────────

/// Oblivious text CRDT. Manages a single text object.
#[derive(Debug)]
pub struct ObliviousTextCrdt {
    pub ops: Vec<CleartextOp>,
    pub elements: Vec<ObliviousElement>,
    pub lamport_counter: u64,
    pub actor_id: String,
    /// Oblivious HEAD sentinel elem_id (32 bytes).
    pub head_id: JsValue,
    /// Oblivious zero int (5 bytes).
    pub zero: JsValue,
    /// Oblivious one int (5 bytes).
    pub one: JsValue,
    /// Last materialized position map: (obliv_position, obliv_elem_id) pairs.
    pub position_map: Vec<(JsValue, JsValue)>,
    /// Oblivious visible count (ObliviousInt). Set by materialize/extract_positions.
    pub oblivious_visible_count: JsValue,
}

impl ObliviousTextCrdt {
    pub fn new(actor_id: String) -> Result<Self, JsValue> {
        let head_id = oblivious_dom::create_byte_array(&[0u8; 32])?;
        let zero = oblivious_dom::create_int(0)?;
        let one = oblivious_dom::create_int(1)?;

        let oblivious_visible_count = oblivious_dom::create_int(0)?;

        Ok(Self {
            ops: Vec::new(),
            elements: Vec::new(),
            lamport_counter: 0,
            actor_id,
            head_id,
            zero,
            one,
            position_map: Vec::new(),
            oblivious_visible_count,
        })
    }

    /// Fixed 32 bytes: 8 bytes lamport (BE) + up to 24 bytes actor (zero-padded).
    fn make_elem_id(&self, lamport: u64, actor: &str) -> Result<JsValue, JsValue> {
        let mut bytes = [0u8; 32];
        bytes[..8].copy_from_slice(&lamport.to_be_bytes());
        let actor_bytes = actor.as_bytes();
        let n = actor_bytes.len().min(24);
        bytes[8..8 + n].copy_from_slice(&actor_bytes[..n]);
        oblivious_dom::create_byte_array(&bytes)
    }

    fn make_sort_key(&self, lamport: u64, actor: &str) -> Result<JsValue, JsValue> {
        let mut bytes = [0u8; 32];
        bytes[..8].copy_from_slice(&lamport.to_be_bytes());
        let actor_bytes = actor.as_bytes();
        let n = actor_bytes.len().min(24);
        bytes[8..8 + n].copy_from_slice(&actor_bytes[..n]);
        oblivious_dom::create_byte_array(&bytes)
    }

    fn make_edge_id(&self, prefix: u8, elem_index: usize) -> Result<JsValue, JsValue> {
        let mut bytes = [0u8; 32];
        bytes[0] = prefix;
        bytes[1..9].copy_from_slice(&(elem_index as u64).to_be_bytes());
        oblivious_dom::create_byte_array(&bytes)
    }

    /// Create an all-0xFF fill value of the given size.
    fn make_fill(size: usize) -> Result<JsValue, JsValue> {
        oblivious_dom::create_byte_array(&vec![0xFFu8; size])
    }

    // ── Internal insert helper (creates element, no materialize) ────

    fn insert_element(
        &mut self,
        cursor_pos: &JsValue,
        value: &JsValue,
        tombstone: JsValue,
    ) -> Result<InsertFields, JsValue> {
        let predecessor_id = self.lookup_elem_at_position(cursor_pos)?;

        self.lamport_counter += 1;
        let lamport = self.lamport_counter;
        let elem_id = self.make_elem_id(lamport, &self.actor_id)?;
        let sort_key = self.make_sort_key(lamport, &self.actor_id)?;

        self.elements.push(ObliviousElement {
            elem_id: elem_id.clone(),
            predecessor_id: predecessor_id.clone(),
            value: value.clone(),
            tombstone,
            sort_key: sort_key.clone(),
        });

        Ok(InsertFields {
            lamport,
            elem_id,
            predecessor_id,
            sort_key,
        })
    }

    // ── Remote sync receive ──────────────────────────────────────────

    pub fn apply_remote_op(
        &mut self,
        lamport: u64,
        actor: &str,
        elem_id: &JsValue,
        predecessor_id: &JsValue,
        value: &JsValue,
        sort_key: &JsValue,
        valid: &JsValue,
        target_elem_id: &JsValue,
        target_valid: &JsValue,
        target_value: &JsValue,
    ) -> Result<(), JsValue> {
        if lamport >= self.lamport_counter {
            self.lamport_counter = lamport + 1;
        }

        // 1. Create new element with provided valid flag
        // valid/target_valid arrive as ObliviousByteArray([0] or [1]) — convert to ObliviousBool
        let true_ba = oblivious_dom::create_byte_array(&[1])?;
        let valid_bool = oblivious_dom::eq_array(valid, &true_ba)?;
        let tombstone = oblivious_dom::not_bool(&valid_bool)?;
        self.elements.push(ObliviousElement {
            elem_id: elem_id.clone(),
            predecessor_id: predecessor_id.clone(),
            value: value.clone(),
            tombstone,
            sort_key: sort_key.clone(),
        });

        // 2. cmov update pass — update target element
        let target_valid_bool = oblivious_dom::eq_array(target_valid, &true_ba)?;
        let target_tombstone = oblivious_dom::not_bool(&target_valid_bool)?;
        for elem in &mut self.elements {
            let is_match = oblivious_dom::eq_array(&elem.elem_id, target_elem_id)?;
            elem.tombstone = oblivious_dom::cmov_bool(
                &is_match, &target_tombstone, &elem.tombstone,
            )?;
            elem.value = oblivious_dom::cmov_array(
                &is_match, target_value, &elem.value,
            )?;
        }

        self.materialize()?;
        Ok(())
    }

    // ── Position map lookup ──────────────────────────────────────────

    fn lookup_elem_at_position(&self, cursor_pos: &JsValue) -> Result<JsValue, JsValue> {
        let mut result = self.head_id.clone();

        for (pos, elem_id) in &self.position_map {
            let is_match = oblivious_dom::eq_int(pos, cursor_pos)?;
            result = oblivious_dom::cmov_array(&is_match, elem_id, &result)?;
        }

        Ok(result)
    }

    // ── Materialization: Euler Tour + Pointer Jumping ─────────────────

    pub fn materialize(&mut self) -> Result<(), JsValue> {
        let n = self.elements.len();
        if n == 0 {
            self.position_map.clear();
            return Ok(());
        }

        let mut edges = self.build_euler_tour()?;
        self.pointer_jumping(&mut edges)?;
        self.extract_positions(&edges)?;
        Ok(())
    }

    fn build_euler_tour(&self) -> Result<Vec<EulerEdge>, JsValue> {
        let n = self.elements.len();
        let mut edges = Vec::with_capacity(2 * n);

        for (idx, elem) in self.elements.iter().enumerate() {
            let down_weight = oblivious_dom::create_int(1)?;
            let down_weight = oblivious_dom::cmov_array(
                &elem.tombstone,
                &self.zero,
                &down_weight,
            )?;

            edges.push(EulerEdge {
                source: elem.predecessor_id.clone(),
                target: elem.elem_id.clone(),
                weight: down_weight,
                edge_id: self.make_edge_id(b'd', idx)?,
                prev_edge_id: self.head_id.clone(),
                next_edge_id: self.head_id.clone(),
                accumulated_weight: oblivious_dom::create_int(0)?,
                is_down: oblivious_dom::create_int(1)?,
                node_id: elem.elem_id.clone(),
                sort_key: elem.sort_key.clone(),
            });

            edges.push(EulerEdge {
                source: elem.elem_id.clone(),
                target: elem.predecessor_id.clone(),
                weight: oblivious_dom::create_int(0)?,
                edge_id: self.make_edge_id(b'u', idx)?,
                prev_edge_id: self.head_id.clone(),
                next_edge_id: self.head_id.clone(),
                accumulated_weight: oblivious_dom::create_int(0)?,
                is_down: oblivious_dom::create_int(0)?,
                node_id: elem.elem_id.clone(),
                sort_key: elem.sort_key.clone(),
            });
        }

        self.discover_siblings_and_link(&mut edges)?;
        Ok(edges)
    }

    /// Linking Euler Tour Phase 1-3.
    fn discover_siblings_and_link(&self, edges: &mut Vec<EulerEdge>) -> Result<(), JsValue> {
        let n = edges.len();
        if n == 0 {
            return Ok(());
        }

        let num_nodes = n / 2;
        let dummy_id = &self.head_id;

        // ── Phase 1: Discover siblings ──────────────────────────────
        // Sort by (predecessor_id(32) + sort_key(32)) = 64-byte composite key.
        // Data: elem_id(32) + predecessor_id(32) + orig_index(5) + next_sibling(32) + is_first_child(5)
        //     = 106-byte composite data.
        let key_size = 64usize;
        let data_size = (ID_SIZE + ID_SIZE + INT_SIZE + ID_SIZE + INT_SIZE) as usize; // 106
        let fill_key = Self::make_fill(key_size)?;
        let fill_data = Self::make_fill(data_size)?;

        let mut sibling_sort: Vec<SortEntry> = Vec::with_capacity(num_nodes);
        for (i, elem) in self.elements.iter().enumerate() {
            let key = oblivious_dom::pack(&[
                &elem.predecessor_id,
                &elem.sort_key,
            ])?;
            let orig_idx = oblivious_dom::create_int(i as i32)?;
            let is_fc_init = oblivious_dom::create_int(0)?;
            let data = oblivious_dom::pack(&[
                &elem.elem_id,       // [0..32] elem_id
                &elem.predecessor_id, // [32..64] predecessor_id
                &orig_idx,            // [64..69] original index
                dummy_id,             // [69..101] next_sibling
                &is_fc_init,          // [101..106] is_first_child
            ])?;
            sibling_sort.push(SortEntry::new(key, data));
        }

        pad_to_power_of_2(&mut sibling_sort, &fill_key, &fill_data);
        bitonic_sort(&mut sibling_sort)?;

        // Unpack for linear scan. We need elem_id, predecessor_id from data.
        // Also need to read/write next_sibling and is_first_child.
        struct SiblingFields {
            elem_id: JsValue,       // 32 bytes at offset 0
            pred_id: JsValue,       // 32 bytes at offset 32
            orig_idx: JsValue,      // 5 bytes at offset 64
            next_sibling: JsValue,  // 32 bytes at offset 69
            is_first_child: JsValue, // 5 bytes at offset 101
        }

        let padded_len = sibling_sort.len();
        let mut fields: Vec<SiblingFields> = Vec::with_capacity(padded_len);
        for entry in &sibling_sort {
            fields.push(SiblingFields {
                elem_id: oblivious_dom::slice_array(&entry.data, 0, ID_SIZE)?,
                pred_id: oblivious_dom::slice_array(&entry.data, ID_SIZE, 2 * ID_SIZE)?,
                orig_idx: oblivious_dom::slice_array(&entry.data, 2 * ID_SIZE, 2 * ID_SIZE + INT_SIZE)?,
                next_sibling: oblivious_dom::slice_array(&entry.data, 2 * ID_SIZE + INT_SIZE, 3 * ID_SIZE + INT_SIZE)?,
                is_first_child: oblivious_dom::slice_array(&entry.data, 3 * ID_SIZE + INT_SIZE, 3 * ID_SIZE + 2 * INT_SIZE)?,
            });
        }

        // Also unpack the key for predecessor_id comparison during scan.
        // k1 = predecessor_id is at key[0..32].
        let mut key_pred_ids: Vec<JsValue> = Vec::with_capacity(padded_len);
        for entry in &sibling_sort {
            key_pred_ids.push(oblivious_dom::slice_array(&entry.key, 0, ID_SIZE)?);
        }

        // Linear scan to find next_sibling and mark first_child.
        for i in 0..padded_len {
            if i == 0 {
                fields[i].is_first_child = oblivious_dom::create_int(1)?;
            } else {
                let same_parent = oblivious_dom::eq_array(
                    &key_pred_ids[i],
                    &key_pred_ids[i - 1],
                )?;
                fields[i].is_first_child = oblivious_dom::cmov_array(
                    &same_parent,
                    &self.zero,
                    &self.one,
                )?;
                fields[i - 1].next_sibling = oblivious_dom::cmov_array(
                    &same_parent,
                    &fields[i].elem_id,
                    dummy_id,
                )?;
            }
        }

        // Re-pack with orig_index as key for sort-back.
        let sortback_key_size = INT_SIZE as usize;
        let fill_key_back = Self::make_fill(sortback_key_size)?;
        for i in 0..padded_len {
            sibling_sort[i].key = fields[i].orig_idx.clone();
            sibling_sort[i].data = oblivious_dom::pack(&[
                &fields[i].elem_id,
                &fields[i].pred_id,
                &fields[i].orig_idx,
                &fields[i].next_sibling,
                &fields[i].is_first_child,
            ])?;
        }
        // Re-pad fill entries (they still have 64-byte keys).
        // Since we changed all keys to INT_SIZE, padding keys must also be INT_SIZE.
        // Padding entries beyond num_nodes have fill_data which is 106 bytes — correct.
        // But their keys are still 64 bytes. Fix:
        for i in num_nodes..padded_len {
            sibling_sort[i].key = fill_key_back.clone();
        }
        bitonic_sort(&mut sibling_sort)?;

        // Extract next_sibling and is_first_child per node.
        let mut next_sibling: Vec<JsValue> = Vec::with_capacity(num_nodes);
        let mut is_first_child: Vec<JsValue> = Vec::with_capacity(num_nodes);
        for i in 0..num_nodes {
            let ns = oblivious_dom::slice_array(
                &sibling_sort[i].data,
                2 * ID_SIZE + INT_SIZE,
                3 * ID_SIZE + INT_SIZE,
            )?;
            let fc = oblivious_dom::slice_array(
                &sibling_sort[i].data,
                3 * ID_SIZE + INT_SIZE,
                3 * ID_SIZE + 2 * INT_SIZE,
            )?;
            next_sibling.push(ns);
            is_first_child.push(fc);
        }

        // ── Phase 2: Route first_child to parent ────────────────────
        // Key: join_key(32) + type(5) = 37 bytes
        // Data: first_child_val(32) + orig_index(5) + type(5) = 42 bytes
        let route_key_size = (ID_SIZE + INT_SIZE) as usize; // 37
        let route_data_size = (ID_SIZE + INT_SIZE + INT_SIZE) as usize; // 42
        let fill_rk = Self::make_fill(route_key_size)?;
        let fill_rd = Self::make_fill(route_data_size)?;

        let mut route_records: Vec<SortEntry> = Vec::with_capacity(2 * num_nodes);

        for i in 0..num_nodes {
            let elem = &self.elements[i];
            let is_fc_bool = oblivious_dom::int_to_bool(&is_first_child[i])?;
            let data_val = oblivious_dom::cmov_array(
                &is_fc_bool,
                &elem.elem_id,
                dummy_id,
            )?;
            let orig_idx = oblivious_dom::create_int(i as i32)?;

            // Data record: join on parent_id, type=0
            let key = oblivious_dom::pack(&[&elem.predecessor_id, &self.zero])?;
            let data = oblivious_dom::pack(&[&data_val, &orig_idx, &self.zero])?;
            route_records.push(SortEntry::new(key, data));

            // Query record: join on own id, type=1
            let key = oblivious_dom::pack(&[&elem.elem_id, &self.one])?;
            let data = oblivious_dom::pack(&[&dummy_id, &orig_idx, &self.one])?;
            route_records.push(SortEntry::new(key, data));
        }

        // HEAD sentinel needs a query record so the running register is
        // consumed before real element queries.
        {
            let key = oblivious_dom::pack(&[&self.head_id, &self.one])?;
            let head_orig_idx = oblivious_dom::create_int(num_nodes as i32)?;
            let data = oblivious_dom::pack(&[dummy_id, &head_orig_idx, &self.one])?;
            route_records.push(SortEntry::new(key, data));
        }

        pad_to_power_of_2(&mut route_records, &fill_rk, &fill_rd);
        bitonic_sort(&mut route_records)?;

        // Linear scan: route data into queries.
        let mut running_first_child = dummy_id.clone();
        let padded_route_len = route_records.len();
        for i in 0..padded_route_len {
            let d = &route_records[i].data;
            let data_val = oblivious_dom::slice_array(d, 0, ID_SIZE)?;
            let type_flag = oblivious_dom::slice_array(d, ID_SIZE + INT_SIZE, ID_SIZE + 2 * INT_SIZE)?;

            let is_data = oblivious_dom::eq_int(&type_flag, &self.zero)?;
            let is_query = oblivious_dom::eq_int(&type_flag, &self.one)?;

            let has_value = oblivious_dom::not_bool(
                &oblivious_dom::eq_array(&data_val, dummy_id)?,
            )?;
            let should_update = oblivious_dom::and_bool(&is_data, &has_value)?;
            running_first_child = oblivious_dom::cmov_array(
                &should_update,
                &data_val,
                &running_first_child,
            )?;

            // Write to query: replace data_val with running register
            let new_data_val = oblivious_dom::cmov_array(
                &is_query,
                &running_first_child,
                &data_val,
            )?;
            // Repack data with updated val
            let orig_idx = oblivious_dom::slice_array(d, ID_SIZE, ID_SIZE + INT_SIZE)?;
            route_records[i].data = oblivious_dom::pack(&[&new_data_val, &orig_idx, &type_flag])?;

            running_first_child = oblivious_dom::cmov_array(
                &is_query,
                dummy_id,
                &running_first_child,
            )?;
        }

        // Sort back by (orig_index(5) + type(5)) = 10 bytes
        let sortback2_key_size = (INT_SIZE + INT_SIZE) as usize; // 10
        let fill_rk2 = Self::make_fill(sortback2_key_size)?;
        for i in 0..padded_route_len {
            let d = &route_records[i].data;
            let orig_idx = oblivious_dom::slice_array(d, ID_SIZE, ID_SIZE + INT_SIZE)?;
            let type_flag = oblivious_dom::slice_array(d, ID_SIZE + INT_SIZE, ID_SIZE + 2 * INT_SIZE)?;
            route_records[i].key = oblivious_dom::pack(&[&orig_idx, &type_flag])?;
        }
        bitonic_sort(&mut route_records)?;

        // Extract first_child per node from query records (at positions 2*i+1)
        let mut first_child: Vec<JsValue> = Vec::with_capacity(num_nodes);
        for i in 0..num_nodes {
            let query_idx = 2 * i + 1;
            if query_idx < route_records.len() {
                let fc = oblivious_dom::slice_array(
                    &route_records[query_idx].data,
                    0, ID_SIZE,
                )?;
                first_child.push(fc);
            } else {
                first_child.push(dummy_id.clone());
            }
        }

        // ── Phase 3: Wire the tour pointers ─────────────────────────
        // Key: elem_id(32) + type(5) = 37 bytes
        // Data: down_eid(32) + up_eid(32) + orig_index(5) + type(5) + query_kind(5) = 79 bytes
        let wire_key_size = (ID_SIZE + INT_SIZE) as usize; // 37
        let wire_data_size = (2 * ID_SIZE + 3 * INT_SIZE) as usize; // 79
        let fill_wk = Self::make_fill(wire_key_size)?;
        let fill_wd = Self::make_fill(wire_data_size)?;

        let mut wire_records: Vec<SortEntry> = Vec::with_capacity(4 * num_nodes);
        let two = oblivious_dom::create_int(2)?;

        for i in 0..num_nodes {
            let elem = &self.elements[i];
            let down_edge_id = &edges[2 * i].edge_id;
            let up_edge_id = &edges[2 * i + 1].edge_id;
            let orig_idx = oblivious_dom::create_int(i as i32)?;

            // Data record
            let key = oblivious_dom::pack(&[&elem.elem_id, &self.zero])?;
            let data = oblivious_dom::pack(&[
                down_edge_id, up_edge_id, &orig_idx, &self.zero, &self.zero,
            ])?;
            wire_records.push(SortEntry::new(key, data));

            // Query 1: first_child's edge_ids
            let key = oblivious_dom::pack(&[&first_child[i], &self.one])?;
            let data = oblivious_dom::pack(&[
                dummy_id, dummy_id, &orig_idx, &self.one, &self.zero,
            ])?;
            wire_records.push(SortEntry::new(key, data));

            // Query 2: next_sibling's edge_ids
            let key = oblivious_dom::pack(&[&next_sibling[i], &self.one])?;
            let data = oblivious_dom::pack(&[
                dummy_id, dummy_id, &orig_idx, &self.one, &self.one,
            ])?;
            wire_records.push(SortEntry::new(key, data));

            // Query 3: parent's edge_ids
            let key = oblivious_dom::pack(&[&elem.predecessor_id, &self.one])?;
            let data = oblivious_dom::pack(&[
                dummy_id, dummy_id, &orig_idx, &self.one, &two,
            ])?;
            wire_records.push(SortEntry::new(key, data));
        }

        pad_to_power_of_2(&mut wire_records, &fill_wk, &fill_wd);
        bitonic_sort(&mut wire_records)?;

        // Linear scan: route data into queries.
        let mut running_down_eid = dummy_id.clone();
        let mut running_up_eid = dummy_id.clone();
        let padded_wire_len = wire_records.len();

        for i in 0..padded_wire_len {
            let d = &wire_records[i].data;
            let down_eid = oblivious_dom::slice_array(d, 0, ID_SIZE)?;
            let up_eid = oblivious_dom::slice_array(d, ID_SIZE, 2 * ID_SIZE)?;
            let type_flag = oblivious_dom::slice_array(d, 2 * ID_SIZE + INT_SIZE, 2 * ID_SIZE + 2 * INT_SIZE)?;

            let is_data = oblivious_dom::eq_int(&type_flag, &self.zero)?;
            let is_query = oblivious_dom::eq_int(&type_flag, &self.one)?;

            running_down_eid = oblivious_dom::cmov_array(&is_data, &down_eid, &running_down_eid)?;
            running_up_eid = oblivious_dom::cmov_array(&is_data, &up_eid, &running_up_eid)?;

            let new_down = oblivious_dom::cmov_array(&is_query, &running_down_eid, &down_eid)?;
            let new_up = oblivious_dom::cmov_array(&is_query, &running_up_eid, &up_eid)?;

            let orig_idx = oblivious_dom::slice_array(d, 2 * ID_SIZE, 2 * ID_SIZE + INT_SIZE)?;
            let query_kind = oblivious_dom::slice_array(d, 2 * ID_SIZE + 2 * INT_SIZE, 2 * ID_SIZE + 3 * INT_SIZE)?;
            wire_records[i].data = oblivious_dom::pack(&[
                &new_down, &new_up, &orig_idx, &type_flag, &query_kind,
            ])?;
        }

        // Sort back by (orig_index(5) + type(5) + query_kind(5)) = 15 bytes
        let sortback3_key_size = (3 * INT_SIZE) as usize; // 15
        let fill_wk3 = Self::make_fill(sortback3_key_size)?;
        for i in 0..padded_wire_len {
            let d = &wire_records[i].data;
            let orig_idx = oblivious_dom::slice_array(d, 2 * ID_SIZE, 2 * ID_SIZE + INT_SIZE)?;
            let type_flag = oblivious_dom::slice_array(d, 2 * ID_SIZE + INT_SIZE, 2 * ID_SIZE + 2 * INT_SIZE)?;
            let query_kind = oblivious_dom::slice_array(d, 2 * ID_SIZE + 2 * INT_SIZE, 2 * ID_SIZE + 3 * INT_SIZE)?;
            wire_records[i].key = oblivious_dom::pack(&[&orig_idx, &type_flag, &query_kind])?;
        }
        bitonic_sort(&mut wire_records)?;

        // Extract results: 4 records per node (data, q0=first_child, q1=next_sib, q2=parent)
        for i in 0..num_nodes {
            let base = 4 * i;
            if base + 3 >= wire_records.len() {
                break;
            }

            let fc_down_eid = oblivious_dom::slice_array(&wire_records[base + 1].data, 0, ID_SIZE)?;
            let ns_down_eid = oblivious_dom::slice_array(&wire_records[base + 2].data, 0, ID_SIZE)?;
            let parent_up_eid = oblivious_dom::slice_array(&wire_records[base + 3].data, ID_SIZE, 2 * ID_SIZE)?;

            let up_u_eid = &edges[2 * i + 1].edge_id;

            let has_child = oblivious_dom::not_bool(
                &oblivious_dom::eq_array(&fc_down_eid, dummy_id)?,
            )?;
            let down_next = oblivious_dom::cmov_array(&has_child, &fc_down_eid, up_u_eid)?;

            let has_next_sib = oblivious_dom::not_bool(
                &oblivious_dom::eq_array(&ns_down_eid, dummy_id)?,
            )?;
            let up_next = oblivious_dom::cmov_array(&has_next_sib, &ns_down_eid, &parent_up_eid)?;

            edges[2 * i].next_edge_id = down_next;
            edges[2 * i + 1].next_edge_id = up_next;
        }

        // ── Convert next→prev via oblivious routing ─────────────────
        // Key: edge_id(32) + type(5) = 37 bytes
        // Data: prev_val(32) + orig_index(5) + type(5) = 42 bytes
        let total_edges = 2 * num_nodes;
        let prev_key_size = (ID_SIZE + INT_SIZE) as usize; // 37
        let prev_data_size = (ID_SIZE + 2 * INT_SIZE) as usize; // 42
        let fill_pk = Self::make_fill(prev_key_size)?;
        let fill_pd = Self::make_fill(prev_data_size)?;

        let mut prev_records: Vec<SortEntry> = Vec::with_capacity(2 * total_edges);

        for i in 0..total_edges {
            let orig_idx = oblivious_dom::create_int(i as i32)?;

            // Data: target's edge_id as join key, my edge_id as value
            let key = oblivious_dom::pack(&[&edges[i].next_edge_id, &self.zero])?;
            let data = oblivious_dom::pack(&[&edges[i].edge_id, &orig_idx, &self.zero])?;
            prev_records.push(SortEntry::new(key, data));

            // Query: my edge_id as join key
            let key = oblivious_dom::pack(&[&edges[i].edge_id, &self.one])?;
            let data = oblivious_dom::pack(&[dummy_id, &orig_idx, &self.one])?;
            prev_records.push(SortEntry::new(key, data));
        }

        // Sentinel query for dummy edge ID: the last edge in the tour has
        // next_edge_id = dummy, so its Data record (key = dummy+0) would leak
        // into the first real Query. This sentinel drains that register.
        {
            let key = oblivious_dom::pack(&[dummy_id, &self.one])?;
            let sentinel_idx = oblivious_dom::create_int(total_edges as i32)?;
            let data = oblivious_dom::pack(&[dummy_id, &sentinel_idx, &self.one])?;
            prev_records.push(SortEntry::new(key, data));
        }

        pad_to_power_of_2(&mut prev_records, &fill_pk, &fill_pd);
        bitonic_sort(&mut prev_records)?;

        // Scan: route prev values.
        let mut running_prev = dummy_id.clone();
        let padded_prev_len = prev_records.len();
        for i in 0..padded_prev_len {
            let d = &prev_records[i].data;
            let prev_val = oblivious_dom::slice_array(d, 0, ID_SIZE)?;
            let type_flag = oblivious_dom::slice_array(d, ID_SIZE + INT_SIZE, ID_SIZE + 2 * INT_SIZE)?;

            let is_data = oblivious_dom::eq_int(&type_flag, &self.zero)?;
            let is_query = oblivious_dom::eq_int(&type_flag, &self.one)?;

            running_prev = oblivious_dom::cmov_array(&is_data, &prev_val, &running_prev)?;
            let new_prev = oblivious_dom::cmov_array(&is_query, &running_prev, &prev_val)?;

            let orig_idx = oblivious_dom::slice_array(d, ID_SIZE, ID_SIZE + INT_SIZE)?;
            prev_records[i].data = oblivious_dom::pack(&[&new_prev, &orig_idx, &type_flag])?;

            running_prev = oblivious_dom::cmov_array(&is_query, dummy_id, &running_prev)?;
        }

        // Sort back by (orig_index(5) + type(5)) = 10 bytes
        let sortback_prev_key_size = (2 * INT_SIZE) as usize; // 10
        let fill_pk2 = Self::make_fill(sortback_prev_key_size)?;
        for i in 0..padded_prev_len {
            let d = &prev_records[i].data;
            let orig_idx = oblivious_dom::slice_array(d, ID_SIZE, ID_SIZE + INT_SIZE)?;
            let type_flag = oblivious_dom::slice_array(d, ID_SIZE + INT_SIZE, ID_SIZE + 2 * INT_SIZE)?;
            prev_records[i].key = oblivious_dom::pack(&[&orig_idx, &type_flag])?;
        }
        bitonic_sort(&mut prev_records)?;

        // Apply prev_edge_id from query records.
        for i in 0..total_edges {
            let query_idx = 2 * i + 1;
            if query_idx < prev_records.len() {
                edges[i].prev_edge_id = oblivious_dom::slice_array(
                    &prev_records[query_idx].data,
                    0, ID_SIZE,
                )?;
            }
        }

        Ok(())
    }

    /// Step 2: Pointer jumping — compute prefix sums along the Euler Tour.
    fn pointer_jumping(&self, edges: &mut Vec<EulerEdge>) -> Result<(), JsValue> {
        let e = edges.len();
        if e == 0 {
            return Ok(());
        }

        for edge in edges.iter_mut() {
            edge.accumulated_weight = edge.weight.clone();
        }

        let iterations = (e as f64).log2().ceil() as usize;
        let dummy_id = &self.head_id;

        // Key: join_key(32) + record_type(5) = 37 bytes
        // Data: val_weight(5) + val_prev(32) + orig_index(5) + record_type(5) = 47 bytes
        let pj_key_size = (ID_SIZE + INT_SIZE) as usize; // 37
        let pj_data_size = (INT_SIZE + ID_SIZE + INT_SIZE + INT_SIZE) as usize; // 47
        let fill_pjk = Self::make_fill(pj_key_size)?;
        let fill_pjd = Self::make_fill(pj_data_size)?;

        // Sort-back key: orig_index(5) + type(5) = 10 bytes
        let sortback_pj_key_size = (2 * INT_SIZE) as usize; // 10
        let fill_pjk2 = Self::make_fill(sortback_pj_key_size)?;

        for _step in 0..iterations {
            let mut sort_entries: Vec<SortEntry> = Vec::with_capacity(2 * e);

            for (i, edge) in edges.iter().enumerate() {
                let orig_idx = oblivious_dom::create_int(i as i32)?;

                // Data record
                let key = oblivious_dom::pack(&[&edge.edge_id, &self.zero])?;
                let data = oblivious_dom::pack(&[
                    &edge.accumulated_weight, &edge.prev_edge_id, &orig_idx, &self.zero,
                ])?;
                sort_entries.push(SortEntry::new(key, data));

                // Query record
                let key = oblivious_dom::pack(&[&edge.prev_edge_id, &self.one])?;
                let data = oblivious_dom::pack(&[
                    &self.zero, dummy_id, &orig_idx, &self.one,
                ])?;
                sort_entries.push(SortEntry::new(key, data));
            }

            pad_to_power_of_2(&mut sort_entries, &fill_pjk, &fill_pjd);
            bitonic_sort(&mut sort_entries)?;

            // Linear scan: route data into queries.
            let mut running_weight = self.zero.clone();
            let mut running_prev = dummy_id.clone();
            let padded_pj_len = sort_entries.len();

            for i in 0..padded_pj_len {
                let d = &sort_entries[i].data;
                let val_weight = oblivious_dom::slice_array(d, 0, INT_SIZE)?;
                let val_prev = oblivious_dom::slice_array(d, INT_SIZE, INT_SIZE + ID_SIZE)?;
                let type_flag = oblivious_dom::slice_array(d, INT_SIZE + ID_SIZE + INT_SIZE, INT_SIZE + ID_SIZE + 2 * INT_SIZE)?;

                let is_data = oblivious_dom::eq_int(&type_flag, &self.zero)?;
                let is_query = oblivious_dom::eq_int(&type_flag, &self.one)?;

                running_weight = oblivious_dom::cmov_array(&is_data, &val_weight, &running_weight)?;
                running_prev = oblivious_dom::cmov_array(&is_data, &val_prev, &running_prev)?;

                let new_weight = oblivious_dom::cmov_array(&is_query, &running_weight, &val_weight)?;
                let new_prev = oblivious_dom::cmov_array(&is_query, &running_prev, &val_prev)?;

                let orig_idx = oblivious_dom::slice_array(d, INT_SIZE + ID_SIZE, INT_SIZE + ID_SIZE + INT_SIZE)?;
                sort_entries[i].data = oblivious_dom::pack(&[&new_weight, &new_prev, &orig_idx, &type_flag])?;
            }

            // Sort back by (orig_index + type).
            for i in 0..padded_pj_len {
                let d = &sort_entries[i].data;
                let orig_idx = oblivious_dom::slice_array(d, INT_SIZE + ID_SIZE, INT_SIZE + ID_SIZE + INT_SIZE)?;
                let type_flag = oblivious_dom::slice_array(d, INT_SIZE + ID_SIZE + INT_SIZE, INT_SIZE + ID_SIZE + 2 * INT_SIZE)?;
                sort_entries[i].key = oblivious_dom::pack(&[&orig_idx, &type_flag])?;
            }
            bitonic_sort(&mut sort_entries)?;

            // Apply updates from query records.
            for i in 0..e {
                let query_idx = 2 * i + 1;
                if query_idx < sort_entries.len() {
                    let qd = &sort_entries[query_idx].data;
                    let query_weight = oblivious_dom::slice_array(qd, 0, INT_SIZE)?;
                    let query_prev = oblivious_dom::slice_array(qd, INT_SIZE, INT_SIZE + ID_SIZE)?;

                    edges[i].accumulated_weight = oblivious_dom::add_int(
                        &edges[i].accumulated_weight,
                        &query_weight,
                    )?;
                    edges[i].prev_edge_id = query_prev;
                }
            }
        }

        Ok(())
    }

    /// Step 3: Extract DFS positions from Euler Tour edge weights.
    fn extract_positions(&mut self, edges: &[EulerEdge]) -> Result<(), JsValue> {
        // Key: accumulated_weight(5) = 5 bytes
        // Data: node_id(32) + is_down(5) = 37 bytes
        let pos_key_size = INT_SIZE as usize; // 5
        let pos_data_size = (ID_SIZE + INT_SIZE) as usize; // 37
        let fill_pk = Self::make_fill(pos_key_size)?;
        let fill_pd = Self::make_fill(pos_data_size)?;

        let mut entries: Vec<SortEntry> = Vec::with_capacity(edges.len());

        for edge in edges {
            let key = edge.accumulated_weight.clone();
            let data = oblivious_dom::pack(&[&edge.node_id, &edge.is_down])?;
            entries.push(SortEntry::new(key, data));
        }

        pad_to_power_of_2(&mut entries, &fill_pk, &fill_pd);
        bitonic_sort(&mut entries)?;

        self.position_map.clear();
        let mut visible_counter = self.zero.clone();

        let real_count = self.elements.len() * 2;
        for i in 0..real_count.min(entries.len()) {
            let elem_id = oblivious_dom::slice_array(&entries[i].data, 0, ID_SIZE)?;
            let is_down_val = oblivious_dom::slice_array(&entries[i].data, ID_SIZE, ID_SIZE + INT_SIZE)?;
            let is_down = oblivious_dom::eq_int(&is_down_val, &self.one)?;

            let mut is_tombstoned = oblivious_dom::create_false()?;
            for elem in &self.elements {
                let id_match = oblivious_dom::eq_array(&elem.elem_id, &elem_id)?;
                is_tombstoned = oblivious_dom::cmov_bool(
                    &id_match,
                    &elem.tombstone,
                    &is_tombstoned,
                )?;
            }

            let is_visible = oblivious_dom::and_bool(
                &is_down,
                &oblivious_dom::not_bool(&is_tombstoned)?,
            )?;

            let high_pos = Self::make_fill(INT_SIZE as usize)?;
            let effective_pos = oblivious_dom::cmov_array(&is_visible, &visible_counter, &high_pos)?;
            self.position_map.push((effective_pos, elem_id));

            visible_counter = oblivious_dom::cmov_array(
                &is_visible,
                &oblivious_dom::add_int(&visible_counter, &self.one)?,
                &visible_counter,
            )?;
        }

        self.oblivious_visible_count = visible_counter;
        Ok(())
    }

    // ── Render buffer ────────────────────────────────────────────────

    pub fn get_render_buffer(&self) -> Result<Vec<JsValue>, JsValue> {
        if self.position_map.is_empty() {
            return Ok(Vec::new());
        }

        // Key: position(5) = 5 bytes
        // Data: value (same size across all elements)
        let pos_key_size = INT_SIZE as usize;
        let fill_pk = Self::make_fill(pos_key_size)?;

        // Use first element's value as the initial placeholder so sizes match.
        let value_placeholder = self.elements[0].value.clone();

        let mut entries: Vec<SortEntry> = Vec::new();

        for (pos, map_elem_id) in &self.position_map {
            let mut value = value_placeholder.clone();
            for elem in &self.elements {
                let id_match = oblivious_dom::eq_array(&elem.elem_id, map_elem_id)?;
                value = oblivious_dom::cmov_array(&id_match, &elem.value, &value)?;
            }

            entries.push(SortEntry::new(pos.clone(), value));
        }

        if entries.is_empty() {
            return Ok(Vec::new());
        }

        // Fill data must match value size. Use first element's value as reference
        // — all values have the same size since they're all single characters.
        let fill_pd = value_placeholder;

        pad_to_power_of_2(&mut entries, &fill_pk, &fill_pd);
        bitonic_sort(&mut entries)?;

        // Zero out the validity byte for non-visible entries so
        // DecryptString skips them during rendering.
        let zero_validity = oblivious_dom::create_byte_array(&[0u8])?;
        let count = self.elements.len();
        let mut buffer = Vec::with_capacity(count);
        for i in 0..count {
            let is_fill = oblivious_dom::eq_array(&entries[i].key, &fill_pk)?;
            let orig_validity = oblivious_dom::slice_array(&entries[i].data, 0, 1)?;
            let new_validity = oblivious_dom::cmov_array(&is_fill, &zero_validity, &orig_validity)?;
            let rest = oblivious_dom::slice_array(
                &entries[i].data, 1, INT_SIZE as u32,
            )?;
            buffer.push(oblivious_dom::concat_arrays(&new_validity, &rest)?);
        }

        Ok(buffer)
    }

    // ── Oblivious edit (all keystroke logic) ─────────────────────────

    const KC_BACKSPACE: i32 = 8;
    const KC_DELETE: i32 = 46;
    const KC_LEFT: i32 = 37;
    const KC_RIGHT: i32 = 39;

    pub fn oblivious_edit(
        &mut self,
        key_code: &JsValue,
        cursor: &JsValue,
    ) -> Result<EditResult, JsValue> {
        // 1. Classify key
        let kc_bs = oblivious_dom::create_int(Self::KC_BACKSPACE)?;
        let kc_del = oblivious_dom::create_int(Self::KC_DELETE)?;
        let kc_left = oblivious_dom::create_int(Self::KC_LEFT)?;
        let kc_right = oblivious_dom::create_int(Self::KC_RIGHT)?;

        let is_bs = oblivious_dom::eq_int(key_code, &kc_bs)?;
        let is_del = oblivious_dom::eq_int(key_code, &kc_del)?;
        let is_left = oblivious_dom::eq_int(key_code, &kc_left)?;
        let is_right = oblivious_dom::eq_int(key_code, &kc_right)?;
        let is_arrow = oblivious_dom::or_bool(&is_left, &is_right)?;
        let is_control = oblivious_dom::or_bool(
            &oblivious_dom::or_bool(&is_bs, &is_del)?,
            &is_arrow,
        )?;
        let is_printable = oblivious_dom::not_bool(&is_control)?;

        // Pack keyCode into a fixed-size ObliviousByteArray for uniform element values
        let key_value = oblivious_dom::pack(&[key_code])?;
        let invalid_value = oblivious_dom::create_byte_array(&[0u8; 5])?;

        // 2. Always insert an INVALID element at cursor position
        let tombstone_true = oblivious_dom::create_true()?;
        let insert_fields = self.insert_element(cursor, &invalid_value, tombstone_true)?;
        let new_elem_id = insert_fields.elem_id.clone();

        // 3. cmov update pass over ALL elements
        //    a. New element: set valid=true + value=keyCode if printable
        //    b. Delete target: set valid=false + value=invalid if should_delete
        let can_dec = oblivious_dom::gt_int(cursor, &self.zero)?;
        let dec_cursor = oblivious_dom::sub_int(cursor, &self.one)?;
        let safe_dec = oblivious_dom::cmov_array(&can_dec, &dec_cursor, cursor)?;
        let delete_cursor = oblivious_dom::cmov_array(&is_bs, &safe_dec, cursor)?;

        let should_delete = oblivious_dom::or_bool(&is_bs, &is_del)?;
        let delete_target_id = self.lookup_elem_at_position(&delete_cursor)?;

        let ob_true = oblivious_dom::create_true()?;
        let ob_false = oblivious_dom::create_false()?;

        for elem in &mut self.elements {
            // Validate the new element and set its value if printable
            let is_new = oblivious_dom::eq_array(&elem.elem_id, &new_elem_id)?;
            let validate = oblivious_dom::and_bool(&is_new, &is_printable)?;
            elem.tombstone = oblivious_dom::cmov_bool(
                &validate, &ob_false, &elem.tombstone,
            )?;
            elem.value = oblivious_dom::cmov_array(
                &validate, &key_value, &elem.value,
            )?;

            // Invalidate the delete target if should_delete
            let is_target = oblivious_dom::eq_array(&elem.elem_id, &delete_target_id)?;
            let invalidate = oblivious_dom::and_bool(&is_target, &should_delete)?;
            elem.tombstone = oblivious_dom::cmov_bool(
                &invalidate, &ob_true, &elem.tombstone,
            )?;
            elem.value = oblivious_dom::cmov_array(
                &invalidate, &invalid_value, &elem.value,
            )?;
        }

        // 4. Materialize and render
        self.materialize()?;

        let buffer = self.get_render_buffer()?;
        let content_base64 = if buffer.is_empty() {
            String::new()
        } else {
            let mut combined = buffer[0].clone();
            for i in 1..buffer.len() {
                combined = oblivious_dom::concat_arrays(&combined, &buffer[i])?;
            }
            oblivious_dom::to_base64(&combined)?
        };

        // 5. Cursor movement (use oblivious visible count for bounds)
        let dec = oblivious_dom::sub_int(cursor, &self.one)?;
        let inc = oblivious_dom::add_int(cursor, &self.one)?;
        let can_dec2 = oblivious_dom::gt_int(cursor, &self.zero)?;
        let can_inc = oblivious_dom::gt_int(&self.oblivious_visible_count, cursor)?;

        let mut new_cursor = cursor.clone();
        new_cursor = oblivious_dom::cmov_array(
            &is_bs,
            &oblivious_dom::cmov_array(&can_dec2, &dec, cursor)?,
            &new_cursor,
        )?;
        new_cursor = oblivious_dom::cmov_array(
            &is_left,
            &oblivious_dom::cmov_array(&can_dec2, &dec, cursor)?,
            &new_cursor,
        )?;
        new_cursor = oblivious_dom::cmov_array(
            &is_right,
            &oblivious_dom::cmov_array(&can_inc, &inc, cursor)?,
            &new_cursor,
        )?;
        new_cursor = oblivious_dom::cmov_array(&is_printable, &inc, &new_cursor)?;

        // 6. Build unified op
        let dummy_target_id = oblivious_dom::create_byte_array(&[0xFF; 32])?;
        let effective_target = oblivious_dom::cmov_array(
            &should_delete, &delete_target_id, &dummy_target_id,
        )?;
        let target_valid = oblivious_dom::not_bool(&should_delete)?;
        let target_value = oblivious_dom::cmov_array(
            &should_delete, &invalid_value, &key_value,
        )?;

        let op = EditOp {
            lamport: insert_fields.lamport,
            elem_id: insert_fields.elem_id,
            predecessor_id: insert_fields.predecessor_id,
            sort_key: insert_fields.sort_key,
            value: key_value,
            valid: is_printable,
            target_elem_id: effective_target,
            target_valid,
            target_value,
        };

        Ok(EditResult {
            new_cursor,
            op,
            content_base64,
        })
    }

    // ── Debug API (temporary) ────────────────────────────────────────

    pub fn debug_cleartext(&self) -> Result<String, JsValue> {
        let buffer = self.get_render_buffer()?;
        let mut parts = Vec::new();
        for val in &buffer {
            parts.push(oblivious_dom::debug_string(val)?);
        }
        Ok(parts.join(","))
    }

}

// ── Internal types ───────────────────────────────────────────────────

#[derive(Clone, Debug)]
struct EulerEdge {
    source: JsValue,
    target: JsValue,
    weight: JsValue,
    edge_id: JsValue,
    prev_edge_id: JsValue,
    next_edge_id: JsValue,
    accumulated_weight: JsValue,
    is_down: JsValue,
    node_id: JsValue,
    sort_key: JsValue,
}

struct InsertFields {
    lamport: u64,
    elem_id: JsValue,
    predecessor_id: JsValue,
    sort_key: JsValue,
}

pub struct EditOp {
    pub lamport: u64,
    pub elem_id: JsValue,
    pub predecessor_id: JsValue,
    pub sort_key: JsValue,
    pub value: JsValue,
    pub valid: JsValue,
    pub target_elem_id: JsValue,
    pub target_valid: JsValue,
    pub target_value: JsValue,
}

pub struct EditResult {
    pub new_cursor: JsValue,
    pub op: EditOp,
    pub content_base64: String,
}

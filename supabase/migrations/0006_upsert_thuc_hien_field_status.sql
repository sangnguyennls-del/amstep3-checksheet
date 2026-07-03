-- Pha 4 Task 3 fix (review finding "Important"): upsert_thuc_hien() báo
-- status='applied' cho CẢ dòng ngay cả khi 1 trong 2 field (ke_hoach/ket_qua)
-- bị từ chối (ví dụ: Plan được sửa nhưng Actual ngoài cửa sổ +-4 ngày). Client
-- (ChecksheetApp.tsx) trước đây chỉ đọc `status`, không đọc `reason` cho dòng
-- 'applied', nên gọi markSaved cho CẢ ô -- ghi đè `initial` bằng giá trị hiện
-- tại kể cả field đã bị server âm thầm từ chối. Hậu quả: UI hiện ô "đã lưu"
-- sạch trong khi DB có giá trị Actual khác, chỉ lộ ra khi tải lại trang.
--
-- Fix: mở rộng jsonb trả về mỗi dòng, thêm 2 field mới `plan_applied` và
-- `act_applied` (boolean | null):
--   null  -- field đó KHÔNG nằm trong request (client không gửi, tức không đổi)
--   true  -- field đó có trong request VÀ đã áp dụng thành công
--   false -- field đó có trong request nhưng bị từ chối (thiếu quyền, ngoài
--           cửa sổ, hoặc bị conflict ở mức cả dòng)
-- Giữ nguyên `status`/`reason` cũ (không phá vỡ ngữ nghĩa tường thuật tổng quát
-- đã có) -- chỉ CỘNG THÊM 2 field mới để client phân biệt được chính xác field
-- nào bị rớt trong 1 dòng có status='applied'.
--
-- Nhánh "not found" (insert dòng mới) trước đây KHÔNG có else nào cho field bị
-- từ chối (không set v_reason/không tăng v_changed) -- nếu Plan được set còn
-- Actual bị từ chối trên 1 dòng hoàn toàn mới, kết quả cũ hoàn toàn im lặng
-- (status='applied', reason=null) - còn tệ hơn nhánh "found" (vốn ít nhất có
-- set v_reason). Fix bổ sung nhánh else còn thiếu này để act_applied=false có
-- gì đó để báo cáo trong cả 2 nhánh found/not found.
--
-- KHÔNG đổi logic phân quyền (can_edit_plan/can_edit_act/can_edit_act_base) --
-- chỉ mở rộng shape trả về + thêm nhánh else còn thiếu ở phần insert mới.
create or replace function upsert_thuc_hien(payload jsonb) returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_item jsonb;
  v_congviec_id text;
  v_ngay date;
  v_req_ke_hoach boolean;
  v_req_ket_qua text;
  v_expected_updated_at timestamptz;
  v_row thuc_hien;
  v_new_ke_hoach boolean;
  v_new_ket_qua ket_qua_enum;
  v_changed boolean;
  v_results jsonb := '[]'::jsonb;
  v_status text;
  v_reason text;
  v_plan_applied boolean;
  v_act_applied boolean;
begin
  for v_item in select * from jsonb_array_elements(payload)
  loop
    v_congviec_id := v_item ->> 'congviec_id';
    v_ngay := (v_item ->> 'ngay')::date;
    v_req_ke_hoach := case when v_item ? 'ke_hoach' and v_item -> 'ke_hoach' is not null
      then (v_item ->> 'ke_hoach')::boolean else null end;
    v_req_ket_qua := v_item ->> 'ket_qua';
    v_expected_updated_at := case when v_item ? 'expected_updated_at' and v_item -> 'expected_updated_at' is not null
      then (v_item ->> 'expected_updated_at')::timestamptz else null end;
    v_status := 'skipped';
    v_reason := null;
    -- null khi field không nằm trong request; đổi thành true/false khi có xét.
    v_plan_applied := null;
    v_act_applied := null;
    if v_req_ke_hoach is not null then
      v_plan_applied := false;
    end if;
    if v_req_ket_qua is not null then
      v_act_applied := false;
    end if;

    if v_req_ket_qua = 'R' then
      raise exception 'Dùng set_ket_qua_r_with_bat_thuong() để đặt ket_qua=R (cần mô tả bất thường)';
    end if;

    select * into v_row from thuc_hien where congviec_id = v_congviec_id and ngay = v_ngay;

    if found then
      if v_expected_updated_at is not null and v_expected_updated_at <> v_row.updated_at then
        v_status := 'conflict';
        v_reason := 'Dữ liệu đã bị người khác cập nhật, vui lòng tải lại';
        -- v_plan_applied/v_act_applied giữ nguyên false (đã set ở trên nếu có
        -- request) -- xung đột cả dòng thì coi mọi field yêu cầu đều KHÔNG
        -- được áp dụng, đúng thực tế (transaction này không ghi gì cả).
      else
        v_new_ke_hoach := v_row.ke_hoach;
        v_new_ket_qua := v_row.ket_qua;
        v_changed := false;

        if v_req_ke_hoach is not null then
          if v_req_ke_hoach is distinct from v_row.ke_hoach then
            if can_edit_plan(v_congviec_id, v_ngay) then
              v_new_ke_hoach := v_req_ke_hoach;
              v_changed := true;
              v_plan_applied := true;
            else
              v_reason := coalesce(v_reason, 'Không có quyền sửa Plan');
              v_plan_applied := false;
            end if;
          else
            -- Giá trị yêu cầu trùng giá trị hiện có: không có gì để từ chối.
            v_plan_applied := true;
          end if;
        end if;

        if v_req_ket_qua is not null then
          if v_req_ket_qua <> v_row.ket_qua::text then
            if can_edit_act(v_congviec_id, v_ngay, v_row.ket_qua::text, v_req_ket_qua) then
              v_new_ket_qua := v_req_ket_qua::ket_qua_enum;
              v_changed := true;
              v_act_applied := true;
            else
              v_reason := coalesce(v_reason, 'Không có quyền sửa Actual (ngoài cửa sổ cho phép hoặc bị khoá)');
              v_act_applied := false;
            end if;
          else
            v_act_applied := true;
          end if;
        end if;

        if v_changed then
          update thuc_hien
            set ke_hoach = v_new_ke_hoach,
                ket_qua = v_new_ket_qua,
                nguoi_thuc_hien = current_msnv()
            where id = v_row.id;
          v_status := 'applied';
        end if;
      end if;
    else
      v_new_ke_hoach := false;
      v_new_ket_qua := 'N';
      v_changed := false;

      if v_req_ke_hoach is not null then
        if can_edit_plan(v_congviec_id, v_ngay) then
          v_new_ke_hoach := v_req_ke_hoach;
          v_changed := true;
          v_plan_applied := true;
        else
          v_reason := coalesce(v_reason, 'Không có quyền sửa Plan');
          v_plan_applied := false;
        end if;
      end if;

      if v_req_ket_qua is not null then
        if can_edit_act(v_congviec_id, v_ngay, 'N', v_req_ket_qua) then
          v_new_ket_qua := v_req_ket_qua::ket_qua_enum;
          v_changed := true;
          v_act_applied := true;
        else
          -- Nhánh còn thiếu trước đây: field bị từ chối trên dòng MỚI hoàn
          -- toàn không để lại dấu vết gì (không set reason, không set changed).
          -- Nay bổ sung else để mirror đúng nhánh "found" ở trên.
          v_reason := coalesce(v_reason, 'Không có quyền sửa Actual (ngoài cửa sổ cho phép hoặc bị khoá)');
          v_act_applied := false;
        end if;
      end if;

      if v_changed then
        insert into thuc_hien (congviec_id, ngay, ke_hoach, ket_qua, nguoi_thuc_hien)
        values (v_congviec_id, v_ngay, v_new_ke_hoach, v_new_ket_qua, current_msnv());
        v_status := 'applied';
      else
        v_reason := coalesce(v_reason, 'Không có quyền sửa ô này');
      end if;
    end if;

    v_results := v_results || jsonb_build_object(
      'congviec_id', v_congviec_id,
      'ngay', v_ngay,
      'status', v_status,
      'reason', v_reason,
      'plan_applied', v_plan_applied,
      'act_applied', v_act_applied
    );
  end loop;

  return v_results;
end;
$$;

grant execute on function upsert_thuc_hien(jsonb) to authenticated;

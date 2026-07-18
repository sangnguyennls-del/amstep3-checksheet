// Smoke test Việc 2 (Thêm hạng mục) — chạy sau khi migration 0019 đã áp lên DB
// mà SUPABASE_DB_URL trỏ tới (Supabase local). Tự seed fixtures trong
// transaction ROLLBACK -> độc lập hoàn toàn với dữ liệu sẵn có trong DB.
//   $env:SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
//   node scripts/dev/them-hang-muc.smoke.ts
import assert from "node:assert";
import { Client } from "pg";

type Fx = { ownerMsnv: string; thietbiId: string; chitietId: string; congviecId: string };

// Seed tối thiểu trong 1 transaction rồi chạy fn, LUÔN ROLLBACK. Chỉ cần 1
// nguoidung vai_tro 'user' (tránh trigger guard vai_tro của 'admin'/'adminm').
async function withFixture(c: Client, fn: (fx: Fx) => Promise<void>): Promise<void> {
  await c.query("BEGIN");
  try {
    const ownerId = "00000000-0000-4000-8000-0000000a0001";
    await c.query(
      `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated','smoke_owner@test.local')`,
      [ownerId],
    );
    await c.query(
      `insert into nguoidung (id, msnv, ho_ten, vai_tro, kip) values ($1,'SMKOWN','Smoke Owner','user','Kíp 1')`,
      [ownerId],
    );
    const tb = await c.query(
      `insert into thietbi (ma_thiet_bi, ten_thiet_bi, kip, nguoi_phu_trach) values ('SMOKE-TB','TB smoke','Kíp 1','SMKOWN') returning id`,
    );
    const thietbiId = tb.rows[0].id as string;
    const ct = await c.query(
      `insert into chitiet (thietbi_id, stt, ten_chi_tiet) values ($1, 1, 'CT smoke') returning id`,
      [thietbiId],
    );
    const chitietId = ct.rows[0].id as string;
    const cv = await c.query(
      `insert into congviec (chitiet_id, loai_hoat_dong, thoi_gian) values ($1,'Kiểm tra',3) returning id`,
      [chitietId],
    );
    await fn({ ownerMsnv: "SMKOWN", thietbiId, chitietId, congviecId: cv.rows[0].id as string });
  } finally {
    await c.query("ROLLBACK");
  }
}

async function run() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.log("Bỏ qua: thiếu SUPABASE_DB_URL");
    return;
  }
  const c = new Client({ connectionString });
  await c.connect();
  try {
    // (A) CHECK chặn 'them' thiếu thietbi_id
    await withFixture(c, async (fx) => {
      await assert.rejects(
        () =>
          c.query(
            `insert into de_xuat_congviec (loai_de_xuat, loai_hoat_dong_moi, ten_chi_tiet_moi, ly_do, nguoi_de_xuat)
             values ('them','Kiểm tra','X','ly do',$1)`,
            [fx.ownerMsnv],
          ),
        /chk_de_xuat_loai|violates check/i,
        "'them' thiếu thietbi_id phải bị CHECK chặn",
      );
    });

    // (B) CHECK chặn 'them' có CẢ chitiet_id lẫn ten_chi_tiet_moi (num_nonnulls=2)
    await withFixture(c, async (fx) => {
      await assert.rejects(
        () =>
          c.query(
            `insert into de_xuat_congviec (loai_de_xuat, thietbi_id, chitiet_id, ten_chi_tiet_moi, loai_hoat_dong_moi, ly_do, nguoi_de_xuat)
             values ('them',$1,$2,'X','Kiểm tra','ly do',$3)`,
            [fx.thietbiId, fx.chitietId, fx.ownerMsnv],
          ),
        /chk_de_xuat_loai|violates check/i,
        "'them' có cả chitiet_id lẫn ten_chi_tiet_moi phải bị chặn",
      );
    });

    // (C) 'sua' hợp lệ vẫn insert được (không hồi quy hình dạng cũ)
    await withFixture(c, async (fx) => {
      await c.query(
        `insert into de_xuat_congviec (loai_de_xuat, congviec_id, thoi_gian_moi, ly_do, nguoi_de_xuat)
         values ('sua',$1,5,'ly do',$2)`,
        [fx.congviecId, fx.ownerMsnv],
      );
    });

    // (D) create_hang_muc_moi: chi tiết MỚI + công việc đầu tiên, hieu_luc_tu = đầu tháng sau
    await withFixture(c, async (fx) => {
      const r = await c.query(
        `select create_hang_muc_moi($1,null,'CT test smoke','đk cơ bản',9,'Kiểm tra',3,'Ngày',1,'ly do') as res`,
        [fx.thietbiId],
      );
      const res = r.rows[0].res;
      assert.match(res.chitiet_id, /^CT\d{5}$/, "chitiet_id phải dạng CT#####");
      assert.match(res.congviec_id, /^CV\d{5}$/, "congviec_id phải dạng CV#####");
      assert.strictEqual(res.chitiet_moi, true, "phải đánh dấu chi tiết mới");
      const eff = await c.query(
        `select (date_trunc('month', today_vn()) + interval '1 month')::date::text as d`,
      );
      assert.strictEqual(res.hieu_luc_tu, eff.rows[0].d, "hieu_luc_tu phải là đầu tháng sau");
      const cv = await c.query(`select active, hieu_luc_tu::text from congviec where id=$1`, [res.congviec_id]);
      assert.strictEqual(cv.rows[0].active, true);
      assert.strictEqual(cv.rows[0].hieu_luc_tu, eff.rows[0].d);
    });

    // (E) create_hang_muc_moi: THÊM công việc vào chi tiết CÓ SẴN (không tạo chitiet mới)
    await withFixture(c, async (fx) => {
      const before = await c.query(`select count(*)::int n from congviec where chitiet_id=$1`, [fx.chitietId]);
      const r = await c.query(
        `select create_hang_muc_moi($1,$2,null,null,null,'Vệ sinh',2,'Tuần',1,'ly do') as res`,
        [fx.thietbiId, fx.chitietId],
      );
      assert.strictEqual(r.rows[0].res.chitiet_moi, false, "chi tiết có sẵn -> chitiet_moi=false");
      assert.strictEqual(r.rows[0].res.chitiet_id, fx.chitietId, "phải dùng đúng chi tiết đã chọn");
      const after = await c.query(`select count(*)::int n from congviec where chitiet_id=$1`, [fx.chitietId]);
      assert.strictEqual(after.rows[0].n, before.rows[0].n + 1, "phải thêm đúng 1 công việc");
    });

    // (F) propose_them_hang_muc KHÔNG auth -> chặn quyền (không admin, không phải chủ trong ngữ cảnh này)
    await withFixture(c, async (fx) => {
      await assert.rejects(
        () =>
          c.query(
            `select propose_them_hang_muc($1,null,'CT x',null,null,'Kiểm tra',3,'Ngày',1,'ly do')`,
            [fx.thietbiId],
          ),
        /Không có quyền/i,
        "propose không auth phải bị chặn quyền",
      );
    });

    // (G) propose_them_hang_muc thiếu lý do -> lỗi validate (chặn trước cả quyền)
    await withFixture(c, async (fx) => {
      await assert.rejects(
        () =>
          c.query(
            `select propose_them_hang_muc($1,null,'CT x',null,null,'Kiểm tra',3,'Ngày',1,'')`,
            [fx.thietbiId],
          ),
        /Lý do là bắt buộc/i,
        "propose thiếu lý do phải lỗi",
      );
    });

    console.log("them-hang-muc.smoke.ts: PASS");
  } finally {
    await c.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

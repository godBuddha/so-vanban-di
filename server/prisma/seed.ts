// Seed dữ liệu mẫu — Sổ Văn Bản Đi
// - 3 user mẫu: admin/Admin@123, vanthu/VanThu@123, tracuu/Tracuu@123
// - ~50 văn bản đi giả lập năm 2025-2026, số vào sổ tăng dần theo từng năm
import { PrismaClient, DocType, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Nơi nhận — luân chuyển cho hợp thực tế văn thư phường/xã
const NOI_NHAN = [
  'Các phòng, ban, ngành phường; Lưu: VT',
  'UBND quận Hai Bà Trưng',
  'Phòng Tài chính - Kế hoạch; Phòng Đô thị',
  'Trung tâm Phục vụ hành chính công phường',
  'Công an phường; Tổ dân phố số 1-5',
  'Hội Phụ nữ phường; Đoàn TNCS Hồ Chí Minh phường',
  'Ban Tổ chức; Ban Nội vụ; Lưu: VT',
  'Trường Mầm non Hoa Sen; Trường Tiểu học Nguyễn Trãi',
  'Phòng Kinh tế; Phòng Văn hoá - Xã hội',
  'Các tổ dân phố; Lưu: VT, PC',
];

// Người ký — luân chuyển
const NGUOI_KY = [
  'Chủ tịch UBND Nguyễn Văn Hùng',
  'Phó Chủ tịch Trần Thị Mai',
  'Phó Chủ tịch Lê Quang Đông',
  'Chủ tịch UBND Phạm Đức Thắng',
  'Phó Chủ tịch Vũ Thị Hạnh',
];

// Trích yếu — 50 nội dung thực tế
const TRICH_YEU = [
  'V/v triển khai Kế hoạch số 12/KH-UBND về cải cách hành chính năm 2026',
  'V/v mời họp Hội đồng thi đua khen thưởng quý I năm 2026',
  'V/v báo cáo tình hình thực hiện nhiệm vụ 6 tháng đầu năm',
  'V/v phân công người phụ trách công tác phòng, chống thiên tai',
  'V/v thông báo lịch trực ban dịp Tết Nguyên đán',
  'V/v triển khai tuần lễ năng lượng hiệu quả trên địa bàn phường',
  'V/v tổng hợp nhu cầu kinh phí đăng ký dự toán năm sau',
  'V/v tổ chức khảo sát tình hình an ninh trật tự khu phố',
  'V/v tiếp nhận và trả kết quả hồ sơ hành chính công tháng 3',
  'V/v điều chỉnh nhiệm vụ thu ngân sách nhà nước trên địa bàn',
  'V/v kiểm tra công tác quản lý nhà đất và hồ sơ địa chính',
  'V/v vận động nhân dân đăng ký sử dụng dịch vụ công trực tuyến',
  'V/v mời dự Lễ ra quân đầu năm và giao nhiệm vụ thi đua',
  'V/v triển khai mẫu hóa đơn điện tử cho hộ kinh doanh cá thể',
  'V/v báo cáo kết quả kiểm tra việc chấp hành pháp luật về xây dựng',
  'V/v tổ chức đối thoại giữa Chủ tịch UBND phường với nhân dân',
  'V/v phát động phong trào toàn dân đoàn kết xây dựng văn hóa mới',
  'V/v công nhận Xã đoàn kết, an toàn giao thông năm 2026',
  'V/v phối hợp giải quyết khiếu nại, tố cáo của công dân',
  'V/v rà soát và cập nhật cơ sở dữ liệu người dân khu phố',
  'V/v triển khai công tác phòng, chống dịch bệnh trên địa bàn',
  'V/v kế hoạch kiểm tra an toàn vệ sinh thực phẩm trước Tết',
  'V/v tổng hợp kiến nghị của hộ dân về sửa chữa đường gom',
  'V/v thông báo kết quả xét duyệt hộ nghèo, hộ cận nghèo',
  'V/v triển khai thực hiện cơ chế một cửa, một cửa liên thông',
  'V/v bàn giao công trình chiếu sáng đường Trần Phú về phường quản lý',
  'V/v tổ chức hội nghị tổng kết công tác năm và triển khai năm sau',
  'V/v báo cáo kết quả thực hiện cải cách thủ tục hành chính quý II',
  'V/v vận động ủng hộ Quỹ vì người nghèo và Quỹ bảo trợ pháp lý',
  'V/v mời tham gia tập huấn nghiệp vụ văn thư, lưu trữ',
  'V/v triển khai Đề án tăng cường ứng dụng công nghệ thông tin',
  'V/v thông báo về việc thay đổi giờ làm việc trong mùa hè',
  'V/v kiểm tra tình hình sử dụng đất và thu tiền thuê đất',
  'V/v tổ chức hội nghị cử tri trước kỳ bầu cử đại biểu Quốc hội',
  'V/v triển khai kế hoạch tuyên truyền pháp luật về giao thông',
  'V/v phê duyệt phương án bồi thường, hỗ trợ tái định cư',
  'V/v tổng hợp danh sách thanh niên đạt tuổi gọi nhập ngũ',
  'V/v điều động cán bộ đảm nhiệm công tác địa chính phường',
  'V/v thông báo kết quả thi đua tháng và khen thưởng đột xuất',
  'V/v triển khai năm 2026 là năm nâng cao hiệu quả quản lý đô thị',
  'V/v mời tham dự Hội nghị gặp mặt doanh nghiệp trên địa bàn',
  'V/v kế hoạch tổ chức Hội thao - Hội diễn Tết thiếu nhi 1/6',
  'V/v công bố danh mục thủ tục hành chính thuộc thẩm quyền giải quyết',
  'V/v báo cáo tiến độ lập quy hoạch chi tiết tỷ lệ 1/500',
  'V/v xử lý hồ sơ hành chính quá hạn của tổ chức, cá nhân',
  'V/v triển khai nhiệm vụ công tác đoàn thể năm học mới',
  'V/v thành lập Tổ công tác hỗ trợ doanh nghiệp nhỏ và vừa',
  'V/v thông báo điều chỉnh lịch họp UBND phường tháng 8',
  'V/v kiểm tra việc thực hiện quy định về nồng độ cồn khi lái xe',
  'V/v tổng hợp số liệu giám sát môi trường khu dân cư',
];

// Loại văn bản luân chuyển qua các loại
const LOAI_VB: DocType[] = [
  'CONG_VAN', 'CONG_VAN', 'THONG_BAO', 'CONG_VAN', 'QUYET_DINH',
  'BAO_CAO', 'CONG_VAN', 'THONG_BAO', 'CONG_VAN', 'HO_NGHI',
  'CONG_DIEN', 'CONG_VAN', 'QUYET_DINH', 'THONG_BAO', 'CONG_VAN',
  'CHI_THI', 'BAO_CAO', 'CONG_VAN', 'GIOI_THIEU', 'THONG_BAO',
  'CONG_VAN', 'KHAC', 'CONG_VAN', 'QUYET_DINH', 'THONG_BAO',
];

interface DocSeed {
  nam: number;
  date: Date;
}

function buildDates(): DocSeed[] {
  const out: DocSeed[] = [];
  // 30 văn bản năm 2026 (đầu năm đến 12/9/2026), 20 văn bản năm 2025
  for (let i = 0; i < 30; i++) {
    const start = new Date('2026-01-06T00:00:00.000Z').getTime();
    const end = new Date('2026-09-11T00:00:00.000Z').getTime();
    out.push({ nam: 2026, date: new Date(start + Math.round(((end - start) * i) / 29)) });
  }
  for (let i = 0; i < 20; i++) {
    const start = new Date('2025-01-08T00:00:00.000Z').getTime();
    const end = new Date('2025-12-22T00:00:00.000Z').getTime();
    out.push({ nam: 2025, date: new Date(start + Math.round(((end - start) * i) / 19)) });
  }
  // Sắp theo thời gian để số vào sổ tăng dần theo ngày vào sổ
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function main() {
  console.log('Seed: xoá dữ liệu cũ...');
  await prisma.auditLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.document.deleteMany();
  await prisma.yearCounter.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seed: tạo 3 user mẫu...');
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      password: bcrypt.hashSync('Admin@123', 10),
      fullName: 'Quản trị hệ thống',
      role: Role.ADMIN,
    },
  });
  const vanthu = await prisma.user.create({
    data: {
      username: 'vanthu',
      password: bcrypt.hashSync('VanThu@123', 10),
      fullName: 'Nguyễn Thị Văn Thư',
      role: Role.VANTHU,
    },
  });
  await prisma.user.create({
    data: {
      username: 'tracuu',
      password: bcrypt.hashSync('Tracuu@123', 10),
      fullName: 'Trần Văn Tra Cứu',
      role: Role.TRACUU,
    },
  });

  console.log('Seed: tạo ~50 văn bản đi 2025-2026...');
  const unitAbbr = process.env.UNIT_ABBR || 'UBND';
  const dates = buildDates();
  // Bộ đếm số vào sổ riêng cho từng năm
  const counters = new Map<number, number>();

  for (let i = 0; i < dates.length; i++) {
    const { nam, date } = dates[i];
    const loaiVB = LOAI_VB[i % LOAI_VB.length];
    const trichYeu = TRICH_YEU[i % TRICH_YEU.length];
    const soVaoSo = (counters.get(nam) ?? 0) + 1;
    counters.set(nam, soVaoSo);
    const abbr = {
      CONG_VAN: 'CV', CONG_DIEN: 'CĐ', QUYET_DINH: 'QĐ', CHI_THI: 'CT',
      BAO_CAO: 'BC', THONG_BAO: 'TB', HO_NGHI: 'HN', GIOI_THIEU: 'GT', KHAC: 'VB',
    }[loaiVB];
    const soKyHieu = `${soVaoSo}/${nam}/${abbr}-${unitAbbr}`;
    await prisma.document.create({
      data: {
        soVaoSo,
        nam,
        loaiVB,
        soKyHieu,
        ngayBanHanh: date,
        nguoiKy: NGUOI_KY[i % NGUOI_KY.length],
        trichYeu,
        noiNhan: NOI_NHAN[i % NOI_NHAN.length],
        soBan: (i % 3) + 1,
        ghiChu: i % 7 === 0 ? 'Lưu bản điện tử' : null,
        nguoiTaoId: vanthu.id,
        createdAt: date, // giữ nhất quán "ngày tháng" vào sổ
      },
    });
  }

  // YearCounter khớp số đã cấp
  for (const [nam, last] of counters) {
    await prisma.yearCounter.create({ data: { nam, last } });
    console.log(`  YearCounter ${nam}: last=${last}`);
  }

  console.log(`Seed hoàn tất: ${dates.length} văn bản, user admin id=${admin.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileQuestion,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  X,
} from 'lucide-react';

interface DocsModalProps {
  onClose: () => void;
}

type TabType = 'intro' | 'employee' | 'manager' | 'hr' | 'admin' | 'faq';

export const DocsModal: React.FC<DocsModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('intro');

  const tabs: { id: TabType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'intro', label: 'Giới thiệu sản phẩm', icon: Sparkles },
    { id: 'employee', label: 'Cán bộ Nhân viên', icon: Users },
    { id: 'manager', label: 'Trưởng phòng ban', icon: CheckCircle2 },
    { id: 'hr', label: 'Bộ phận Nhân sự (HR)', icon: Clock },
    { id: 'admin', label: 'Quản trị viên (ADMIN)', icon: ShieldCheck },
    { id: 'faq', label: 'Hỏi đáp thường gặp', icon: FileQuestion },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="flex flex-col w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl border border-slate-200 border-t-4 border-t-brand-500 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/80 bg-[#EAF1FB]/50">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-500 text-white shadow-xs">
              <BookOpen className="size-4.5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Tài liệu & Hướng dẫn Sử dụng Hệ thống
              </h2>
              <p className="text-xs text-slate-500">
                Hệ thống Quản trị & Điểm danh Camera AI Petrolimex Attendance
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tab navigation pills */}
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-2 border-b border-slate-200 bg-white [scrollbar-width:none]">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isSel = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isSel
                    ? 'bg-[#FFF1E8] text-brand-700 ring-1 ring-brand-300 shadow-2xs font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`size-3.5 ${isSel ? 'text-brand-600' : 'text-slate-500'}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 text-sm text-slate-700 space-y-5 [scrollbar-width:thin]">
          {/* TAB 1: GIỚI THIỆU SẢN PHẨM */}
          {activeTab === 'intro' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-brand-200 bg-[#FFF1E8]/70 p-4">
                <h3 className="font-bold text-brand-900 text-sm sm:text-base">
                  Hệ thống Quản trị & Điểm danh Camera AI Thông minh
                </h3>
                <p className="text-xs sm:text-sm text-brand-950 mt-1 leading-relaxed">
                  Giải pháp ứng dụng trí tuệ nhân tạo nhận diện khuôn mặt không chạm tốc độ cao qua camera HANET AI,
                  loại bỏ hoàn toàn máy chấm vân tay truyền thống, mang lại tính minh bạch, tức thời và chuẩn hóa cho toàn doanh nghiệp.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl border border-slate-200 p-3.5 bg-white shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                    <span className="flex size-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">✓</span>
                    Chấm công không chạm (&lt; 0.2s)
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Camera AI tự động ghi nhận khi cán bộ nhân viên bước qua sảnh/cửa với độ chính xác trên 99.7%, không cần dừng lại xếp hàng.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 bg-white shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                    <span className="flex size-6 items-center justify-center rounded-md bg-sky-50 text-sky-700">
                      <Video className="size-3.5" />
                    </span>
                    Tua lại Video bằng chứng
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Tự động lưu và trích xuất đoạn video 30 giây thời khắc nhận diện từ camera. Nhân viên và quản lý có thể xem lại ngay lập tức.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 bg-white shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                    <span className="flex size-6 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                      <Clock className="size-3.5" />
                    </span>
                    Quy chuẩn kỷ luật tinh giản
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Không làm phiền bởi thông tin "Đi sớm" hay "Về muộn". Ban ngày hiển thị chuẩn "Đi đúng giờ" hoặc "Đi muộn X'", không gắn nhãn lỗi vô lý.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 bg-white shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                    <span className="flex size-6 items-center justify-center rounded-md bg-violet-50 text-violet-700">
                      <ShieldCheck className="size-3.5" />
                    </span>
                    Khóa sổ &amp; Nhật ký kiểm toán
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Khóa sổ điểm danh tháng khi chốt lương. Mọi thao tác điều chỉnh đều bắt buộc có lý do và được lưu vết kiểm toán (Audit Trail) minh bạch.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CÁN BỘ NHÂN VIÊN */}
          {activeTab === 'employee' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base border-b border-slate-200 pb-2">
                Hướng dẫn dành cho Cán bộ Nhân viên
              </h3>

              <div className="space-y-3 text-xs sm:text-sm">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <span className="font-bold text-slate-900 block">1. Xem kết quả điểm danh hôm nay:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Vào mục <strong>"Cá nhân của tôi"</strong> trên thanh menu. Tại khối "Hôm nay", bạn sẽ thấy ngay giờ vào, lần quẹt gần nhất và trạng thái điểm danh (<strong>Đi đúng giờ</strong> hoặc <strong>Đi muộn X'</strong>).
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <span className="font-bold text-slate-900 block">2. Xem lại ảnh và video quẹt thẻ:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Nhấp vào bất kỳ ngày nào trong bảng lịch sử tháng. Cửa sổ chi tiết sẽ hiển thị ảnh khuôn mặt được camera chụp. Bấm nút <strong>"Xem video"</strong> để tua lại đoạn clip 30 giây lúc bạn đi qua camera.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <span className="font-bold text-slate-900 block">3. Nộp đơn giải trình / xin phép:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Khi đi muộn do tắc đường, quên quẹt lúc về, nghỉ phép hoặc đi công tác: bấm nút <strong>"Nộp đơn"</strong> tại ngày đó, chọn loại đơn phù hợp, ghi rõ lý do và gửi cho Trưởng phòng phê duyệt.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TRƯỞNG PHÒNG BAN */}
          {activeTab === 'manager' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base border-b border-slate-200 pb-2">
                Hướng dẫn dành cho Lãnh đạo Phòng ban (Trưởng phòng)
              </h3>

              <div className="space-y-3 text-xs sm:text-sm">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <span className="font-bold text-slate-900 block">1. Giám sát quân số phòng ban đầu ngày:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Mục <strong>"Bảng công hôm nay"</strong> tự động lọc riêng danh sách nhân sự của phòng bạn. Các thẻ KPI đầu trang phản ánh ngay số lượng nhân sự có mặt, đi đúng giờ, đi muộn và chưa điểm danh.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <span className="font-bold text-slate-900 block">2. Xét duyệt đơn từ của nhân viên:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Vào mục <strong>"Giải trình / Xin phép"</strong> để duyệt các đơn đi muộn, xin nghỉ phép, công tác của nhân sự thuộc phòng mình. Bấm <strong>"Duyệt đơn"</strong> hoặc <strong>"Từ chối"</strong> (có phản hồi lý do).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: BỘ PHẬN NHÂN SỰ */}
          {activeTab === 'hr' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base border-b border-slate-200 pb-2">
                Hướng dẫn dành cho Bộ phận Nhân sự (HR)
              </h3>

              <div className="space-y-3 text-xs sm:text-sm">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <span className="font-bold text-slate-900 block">1. Quản lý nhân sự &amp; Đăng ký FaceID:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Vào <strong>Nhân sự &rarr; Quản lý nhân sự</strong> để thêm mới, sửa thông tin, đặt lại mật khẩu gửi qua email và đăng ký khuôn mặt trực tiếp từ các lượt nhận diện của camera AI.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <span className="font-bold text-slate-900 block">2. Thiết lập ca làm việc &amp; Lễ tết:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Cấu hình giờ bắt đầu, giờ tan ca, phút ân hạn cho từng phòng ban và thiết lập lịch nghỉ Lễ, Tết để hệ thống tự động loại trừ khỏi ngày phải đi làm.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <span className="font-bold text-slate-900 block">3. Báo cáo tháng, Xuất Excel &amp; Khóa sổ:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Xem tổng hợp ngày công và tỷ lệ chuyên cần. Bấm <strong>"Xuất Excel"</strong> để xuất bảng công định dạng chuẩn tính lương. Khi chốt bảng lương cuối tháng, bấm <strong>"Khóa sổ tháng"</strong> để đóng băng dữ liệu.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: QUẢN TRỊ VIÊN ADMIN */}
          {activeTab === 'admin' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base border-b border-slate-200 pb-2">
                Hướng dẫn dành cho Quản trị viên Kỹ thuật (ADMIN)
              </h3>

              <div className="space-y-3 text-xs sm:text-sm">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <span className="font-bold text-slate-900 block">1. Kết nối Camera Hanet &amp; Webhook:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Vào <strong>Quản trị &rarr; Cấu hình hệ thống</strong> để nhập Client ID, Client Secret, Place IDs và thiết lập Webhook URL nhận sự kiện chấm công tức thời từ 20+ camera.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <span className="font-bold text-slate-900 block">2. Kích hoạt tính năng xem Video:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Tại mục Hanet Connect, nhập thông tin tài khoản xem camera và bấm <strong>"Kiểm tra kết nối"</strong> để kích hoạt tính năng phát lại video clip cho toàn hệ thống.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <span className="font-bold text-slate-900 block">3. Nhật ký kiểm toán &amp; Sao lưu:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Theo dõi vết kiểm toán tại <strong>Nhật ký kiểm toán</strong>. Toàn bộ cơ sở dữ liệu được sao lưu định kỳ vào thư mục <code>data/backups/</code>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: FAQ */}
          {activeTab === 'faq' && (
            <div className="space-y-3 text-xs sm:text-sm">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base border-b border-slate-200 pb-2">
                Các câu hỏi thường gặp (FAQ)
              </h3>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="font-bold text-slate-900 block">Q1: Tôi đến sớm 30 phút, sao hệ thống không ghi "đến sớm 30 phút"?</span>
                <p className="text-slate-600 leading-relaxed">
                  Hệ thống áp dụng quy chuẩn kỷ luật lao động mới: Không theo dõi việc đến sớm hay về muộn. Khi bạn đến trước hoặc trong khung giờ cho phép, hệ thống đều ghi nhận là <strong>Đi đúng giờ</strong> để bảng công luôn gọn gàng.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="font-bold text-slate-900 block">Q2: Ban ngày tôi thấy chưa có giờ ra thì có bị tính lỗi không?</span>
                <p className="text-slate-600 leading-relaxed">
                  Hoàn toàn không. Ban ngày khi ca làm việc chưa kết thúc, hệ thống chỉ kiểm tra giờ vào và hiển thị nhãn phụ <em>"Đang trong giờ làm"</em>. Trạng thái thiếu giờ ra chỉ tính sau khi ca làm việc đã kết thúc và bạn không quẹt ra.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="font-bold text-slate-900 block">Q3: Quên quẹt thẻ khi tan ca thì xử lý thế nào?</span>
                <p className="text-slate-600 leading-relaxed">
                  Bạn vào mục <strong>"Cá nhân của tôi"</strong>, bấm <strong>"Nộp đơn"</strong> tại ngày đó, chọn loại <strong>"Bổ sung giờ quẹt"</strong> và ghi giờ ra thực tế để Trưởng phòng phê duyệt.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="font-bold text-slate-900 block">Q4: Tài liệu đầy đủ lưu trữ ở đâu?</span>
                <p className="text-slate-600 leading-relaxed">
                  Hai tệp tài liệu chi tiết định dạng Markdown nằm tại thư mục <code>docs/GIOI_THIEU_SAN_PHAM.md</code> và <code>docs/HUONG_DAN_SU_DUNG.md</code> trong mã nguồn dự án.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
          <span>Phiên bản v4.2 · Petrolimex Attendance</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-semibold text-slate-700 transition-colors cursor-pointer shadow-2xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

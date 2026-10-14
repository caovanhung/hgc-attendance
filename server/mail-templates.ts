import type { MailMessage } from './mail';

export interface MailUser {
  name: string;
  code: string;
  email: string;
}

const SIGN = '\n\nTrân trọng,\nPetrolimex Attendance — Hệ thống Điểm danh Camera AI';
const site = (appUrl: string | null) => (appUrl ? `\nĐịa chỉ đăng nhập: ${appUrl}` : '');

export function welcomeMail(u: MailUser, tempPassword: string, appUrl: string | null): MailMessage {
  return {
    to: u.email,
    subject: 'Petrolimex Attendance — Tài khoản đăng nhập của bạn',
    text:
      `Xin chào ${u.name},\n\nTài khoản điểm danh của bạn đã được tạo.` +
      `\nMã nhân viên: ${u.code}\nĐăng nhập bằng mã nhân viên hoặc email: ${u.email}\nMật khẩu tạm: ${tempPassword}` +
      site(appUrl) +
      '\n\nLần đăng nhập đầu tiên bạn sẽ được yêu cầu đổi mật khẩu.' +
      SIGN,
  };
}

export function resetTempMail(u: MailUser, tempPassword: string, appUrl: string | null): MailMessage {
  return {
    to: u.email,
    subject: 'Petrolimex Attendance — Mật khẩu mới',
    text:
      `Xin chào ${u.name},\n\nMật khẩu của tài khoản ${u.code} vừa được đặt lại.\nMật khẩu tạm: ${tempPassword}` +
      site(appUrl) +
      '\n\nHãy đăng nhập và đổi mật khẩu ngay. Nếu bạn không yêu cầu, hãy báo phòng Nhân sự.' +
      SIGN,
  };
}

export function resetLinkMail(u: MailUser, link: string): MailMessage {
  return {
    to: u.email,
    subject: 'Petrolimex Attendance — Đặt lại mật khẩu',
    text:
      `Xin chào ${u.name},\n\nBạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản ${u.code}.` +
      `\nBấm vào link sau trong vòng 30 phút để đặt mật khẩu mới (chỉ dùng được một lần):\n${link}` +
      '\n\nNếu bạn không yêu cầu, hãy bỏ qua thư này; mật khẩu hiện tại vẫn giữ nguyên.' +
      SIGN,
  };
}

export function testMail(to: string): MailMessage {
  return { to, subject: 'Petrolimex Attendance — Thư thử', text: 'Cấu hình gửi thư hoạt động bình thường.' + SIGN };
}

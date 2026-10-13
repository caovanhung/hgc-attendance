import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Modal, primaryBtn } from './ui';

export const TempPasswordDialog: React.FC<{ employeeLabel: string; password: string; onClose: () => void }> = ({ employeeLabel, password, onClose }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  };
  return (
    <Modal title="Mật khẩu tạm" onClose={onClose}>
      <div className="space-y-3">
        <p>
          Mật khẩu tạm của <strong>{employeeLabel}</strong>. Mật khẩu chỉ hiện <strong>một lần</strong>; hãy giao trực tiếp cho nhân viên.
          Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu tiên.
        </p>
        <div className="flex items-center gap-2 bg-slate-950 rounded-xl p-3">
          <code className="flex-1 text-emerald-400 font-mono text-base tracking-wider">{password}</code>
          <button onClick={copy} className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold flex items-center gap-1 cursor-pointer">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Đã chép' : 'Sao chép'}
          </button>
        </div>
        <button onClick={onClose} className={`${primaryBtn} w-full`}>
          Tôi đã ghi lại mật khẩu
        </button>
      </div>
    </Modal>
  );
};

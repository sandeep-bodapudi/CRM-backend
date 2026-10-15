import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

interface QRCodeVisualProps {
  value: string;
  size?: number;
  label?: string;
}

export const QRCodeVisual: React.FC<QRCodeVisualProps> = ({ value, size = 180, label }) => {
  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="bg-white p-3 rounded-2xl border-2 border-slate-900 shadow-lg relative inline-block">
        <QRCodeCanvas
          value={value || 'https://radharealhomeproperties.com'}
          size={size}
          bgColor="#ffffff"
          fgColor="#0f172a"
          level="H" // High error correction to allow logo placement
          includeMargin={false}
          imageSettings={{
            src: '/logo.svg', // Uses your company logo
            x: undefined,
            y: undefined,
            height: size * 0.25, // Logo will be 25% of QR code size
            width: size * 0.25,
            excavate: true, // This carves out the QR code blocks behind the logo to make it clearer
          }}
          className="rounded-lg"
        />
      </div>

      {label && <span className="font-mono text-[11px] font-bold text-slate-700">{label}</span>}
    </div>
  );
};

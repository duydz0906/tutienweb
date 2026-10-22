import React from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import { App } from './App';
import './styles.css';

/**
 * A thrown error inside React (or a module that fails to load) used to leave `#root` empty, so the
 * player saw a blank page with no clue. Everything below turns that failure into readable text.
 */
type Fatal = { message: string; stack?: string };

function describe(error: unknown): Fatal {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack };
  if (typeof error === 'string') return { message: error };
  return { message: 'Lỗi không xác định.' };
}

/** Only the start-up failures that really happen, with the exact command that fixes them. */
function hintsFor(message: string): string[] {
  const hints = ['Bấm "Tải lại trang" (Ctrl/Cmd + Shift + R).'];
  if (/Outdated Optimize Dep|Failed to fetch dynamically imported module|Importing a module script failed|504/i.test(message)) {
    hints.push('Vite đang dùng cache phụ thuộc cũ: tắt terminal rồi chạy lại "npm run dev". '
      + 'Nếu vẫn lỗi, xoá thư mục apps/client/node_modules/.vite rồi chạy lại.');
  }
  if (/WebGL|context lost|WebGLRenderer/i.test(message)) {
    hints.push('Trình duyệt chưa bật WebGL: bật "Hardware acceleration" trong Chrome/Edge rồi mở lại game.');
  }
  if (/fetch|NetworkError|ECONNREFUSED|Failed to load resource/i.test(message)) {
    hints.push('Máy chủ API (cổng 3001) chưa chạy: chạy "npm run dev" ở thư mục gốc dự án rồi tải lại.');
  }
  return hints;
}

const box: React.CSSProperties = {
  position: 'fixed', zIndex: 2147483000, inset: 0, display: 'grid', placeItems: 'center', padding: 24,
  background: 'radial-gradient(circle at 50% 20%, #16262c, #070d10 70%)', color: '#e9f2ee',
  fontFamily: 'system-ui, "Segoe UI", sans-serif', overflow: 'auto',
};
const card: React.CSSProperties = {
  width: 'min(720px, 100%)', background: 'rgba(13, 27, 32, 0.94)', border: '1px solid rgba(190, 226, 208, 0.28)',
  borderRadius: 16, padding: '22px 24px', boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
};

function CrashReport({ error }: { error: Fatal }) {
  return <div style={box} role="alert" data-testid="crash-report">
    <div style={card}>
      <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.18em', color: '#e6c78a' }}>VÂN THƯỢNG ONLINE</p>
      <h1 style={{ margin: '6px 0 4px', fontSize: 21 }}>Giao diện không khởi động được</h1>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#a9bdb5' }}>
        Trang bị dừng trước khi vẽ xong. Chi tiết bên dưới được gửi kèm khi bạn báo lỗi.
      </p>
      <pre style={{ margin: '0 0 14px', padding: '10px 12px', borderRadius: 10, background: 'rgba(255, 122, 89, 0.1)',
        border: '1px solid rgba(255, 122, 89, 0.35)', color: '#ffbba5', fontSize: 12.5,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error.message}</pre>
      <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: '#cfe0d8' }}>
        {hintsFor(error.message).map((hint) => <li key={hint}>{hint}</li>)}
      </ul>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => window.location.reload()}
          style={{ padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(180deg, #f0d49a, #d8b273)', color: '#20180c', fontWeight: 700 }}>
          Tải lại trang
        </button>
      </div>
      {error.stack && <details style={{ marginTop: 14, fontSize: 11.5, color: '#8fa8a0' }}>
        <summary style={{ cursor: 'pointer' }}>Chi tiết kỹ thuật</summary>
        <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error.stack}</pre>
      </details>}
    </div>
  </div>;
}

class RootBoundary extends React.Component<{ children: React.ReactNode }, { error: Fatal | null }> {
  state: { error: Fatal | null } = { error: null };
  static getDerivedStateFromError(error: unknown): { error: Fatal } { return { error: describe(error) }; }
  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('[app] giao diện gặp lỗi không phục hồi được', error, info.componentStack);
  }
  render(): React.ReactNode {
    return this.state.error ? <CrashReport error={this.state.error} /> : this.props.children;
  }
}

/** Errors thrown outside React still leave the page blank; show them instead of a white screen. */
function reportOutsideReact(error: unknown): void {
  const target = document.getElementById('root');
  // The UI already rendered: a full crash screen would hide a possibly still usable game.
  if (target && target.childElementCount > 0) {
    console.error('[app] lỗi không xử lý', error);
    return;
  }
  createRoot(target ?? document.body).render(<CrashReport error={describe(error)} />);
}

window.addEventListener('error', (event) => reportOutsideReact(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => reportOutsideReact(event.reason));

const container = document.getElementById('root');
if (!container) {
  document.body.innerHTML = '<p style="color:#fff;font-family:sans-serif;padding:24px">'
    + 'Không tìm thấy phần tử #root trong index.html.</p>';
} else {
  createRoot(container).render(<React.StrictMode><RootBoundary><App /></RootBoundary></React.StrictMode>);
}

const fontUrl = 'assets/textures/font/font.ttf';

let fpsEl;

export function initUI() {
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'GameFont';
      src: url('${fontUrl}') format('truetype');
    }
  `;
  document.head.appendChild(style);

  fpsEl = document.getElementById('fps');
  if (fpsEl) fpsEl.style.fontFamily = "'GameFont', sans-serif";
}

export function setFPS(fps) {
  if (fpsEl) fpsEl.textContent = `FPS: ${fps}`;
}

export function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.remove();
}

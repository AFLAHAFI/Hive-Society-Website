// Embedded calendars and forms (.embed-frame) take a few seconds to load from Google/Indify and
// show a blank white box meanwhile. Hide each frame behind its "Loading…" placeholder (CSS:
// .embed-frame.is-loading) until it finishes loading. Without this script the frame just shows
// as it loads, so nothing breaks; the timeout keeps a slow or blocked embed from hiding forever.
for (const frame of document.querySelectorAll('.embed-frame')) {
  const iframe = frame.querySelector('iframe');
  if (!iframe) continue;
  frame.classList.add('is-loading');
  const done = () => frame.classList.remove('is-loading');
  iframe.addEventListener('load', done, { once: true });
  setTimeout(done, 10000);
}

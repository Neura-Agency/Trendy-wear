import Document, { Html, Head, Main, NextScript } from "next/document";

/**
 * Presentation only.
 *
 * The inline script below runs before paint and sets `data-theme` on <html>
 * so the app never flashes the wrong theme. It reads the same "theme" key the
 * theme switcher writes ("light" | "dark" | "system") and resolves "system"
 * against the OS preference. No data, auth, or business logic is involved.
 */
const themeBootstrap = `(function(){try{
  var pref = localStorage.getItem('theme') || 'dark';
  var resolved = pref === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : (pref === 'light' ? 'light' : 'dark');
  var el = document.documentElement;
  el.setAttribute('data-theme', resolved);
  el.setAttribute('data-theme-pref', pref);
  el.style.colorScheme = resolved;
}catch(e){
  document.documentElement.setAttribute('data-theme','dark');
}})();`;

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en" data-theme="dark">
        <Head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Pacifico&display=swap" rel="stylesheet" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
          <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

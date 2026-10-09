// Lives only inside the shadow root, so nothing leaks into the host page.
export const CSS = `
:host{all:initial}
.w{position:fixed;z-index:2147483000;display:flex;flex-direction:column;gap:12px;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.bottom{bottom:20px}
.top{top:20px;flex-direction:column-reverse}
.right{right:20px;align-items:flex-end}
.left{left:20px;align-items:flex-start}
button{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.2)}
button:focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px rgba(0,0,0,.55)}
.n{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#fff;color:#111;font-size:11px;line-height:18px;text-align:center;box-sizing:border-box}
.n[hidden]{display:none}
iframe{display:block;border:0;width:min(380px,calc(100vw - 40px));height:560px;max-height:calc(100vh - 110px);border-radius:14px;background:#fff;box-shadow:0 12px 40px rgba(0,0,0,.25);opacity:0;visibility:hidden;transition:opacity .2s,transform .2s,visibility 0s .2s}
.slide.bottom iframe{transform:translateY(12px)}
.slide.top iframe{transform:translateY(-12px)}
.scale iframe{transform:scale(.92)}
iframe.o{opacity:1;visibility:visible;transform:none;transition:opacity .2s,transform .2s}
@media (prefers-reduced-motion:reduce){iframe,iframe.o{transition:none}}
`;

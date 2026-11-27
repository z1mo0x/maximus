(() => {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const navigation = performance.getEntriesByType("navigation")[0];
  if (motion.matches || navigation?.type === "back_forward" || !Element.prototype.animate) return;
  const sectionEntry = Boolean(location.hash && location.hash !== "#top");

  const root = document.documentElement;
  const listeners = new AbortController();
  const animations = [];
  const easeOut = "cubic-bezier(.23,1,.32,1)";
  const settle = {duration:900, easing:"cubic-bezier(.77,0,.175,1)"};
  let frame, art, guard;

  function returnArtwork() {
    if (!art || art.parentElement === frame) return;
    frame.prepend(art);
    art.removeAttribute("style");
  }

  function finish() {
    if (listeners.signal.aborted) return;
    listeners.abort();
    clearTimeout(guard);
    returnArtwork();
    delete root.dataset.coverIntro;
    for (const animation of animations) animation.cancel();
  }

  // Mark the intro before the first page paint. A slow or failed asset must
  // never leave the cover hidden or prevent the visitor from entering the site.
  root.dataset.coverIntro = "loading";
  guard = setTimeout(finish, 3200);
  for (const type of ["pointerdown", "wheel", "keydown", "hashchange", "pagehide", "resize"]) {
    window.addEventListener(type, finish, {capture:true, passive:true, signal:listeners.signal});
  }
  // The browser scrolls to an initial fragment without visitor input.
  if (!sectionEntry) {
    window.addEventListener("scroll", () => { if (scrollY > 2) finish(); }, {passive:true,signal:listeners.signal});
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) finish(); }, {signal:listeners.signal});
  motion.addEventListener("change", finish, {signal:listeners.signal});

  function play(node, keyframes, timing) {
    const animation = node.animate(keyframes, {...timing, fill:"both"});
    animations.push(animation);
    return animation.finished;
  }

  function decodeBackground(src) {
    const image = new Image();
    image.src = src;
    return image.decode();
  }

  async function start() {
    if ((!sectionEntry && scrollY > 2) || document.hidden) { finish(); return; }
    frame = document.querySelector(".hero-frame");
    art = frame.querySelector(".hero-art");
    const layer = document.querySelector("#cover-intro");
    const iris = layer.querySelector(".intro-iris");
    const outline = layer.querySelector(".intro-outline");
    const loader = layer.querySelector(".intro-loader");
    const progress = layer.querySelector(".intro-track i");
    const resources = [
      decodeBackground("assets/manor.webp"), decodeBackground("assets/scenes/05.webp"),
      frame.querySelector("h1 img").decode(), frame.querySelector(".hero-person").decode(),
      document.fonts.load('italic 900 24px "Maximum Display"', "Максимум"),
      document.fonts.load('400 16px "Golos Text"', "Новый Орлеан 1930"),
      document.fonts.load('600 14px "IBM Plex Mono"', "Серия 01")
    ];
    let ready = 0;
    const loaded = Promise.all(resources.map(resource => resource.then(() => {
      progress.style.transform = "scaleX(" + (++ready / resources.length) + ")";
    })));
    await Promise.all([loaded, new Promise(resolve => setTimeout(resolve, 540))]);
    if (listeners.signal.aborted) return;
    if (sectionEntry) {
      document.querySelector(":target")?.scrollIntoView({behavior:"instant", block:"start"});
      await play(layer, [{opacity:1}, {opacity:0}], {duration:240, easing:easeOut});
      finish();
      return;
    }
    clearTimeout(guard);
    guard = setTimeout(finish, 4200);

    // Project the same artwork through a viewport-sized aperture. Using
    // uniform scale keeps both illustrated panels undistorted on any screen.
    const windowBox = layer.getBoundingClientRect();
    const box = frame.getBoundingClientRect();
    const scale = Math.max(windowBox.width / box.width, windowBox.height / box.height);
    const x = (windowBox.width - box.width * scale) / 2 - box.left;
    const y = (windowBox.height - box.height * scale) / 2 - box.top;
    Object.assign(art.style, {
      inset:"auto", left:box.left + "px", top:box.top + "px", width:box.width + "px", height:box.height + "px",
      transform:"translate(" + x + "px," + y + "px) scale(" + scale + ")"
    });
    iris.append(art);
    for (const corner of frame.querySelectorAll(".corner")) outline.append(corner.cloneNode());
    root.dataset.coverIntro = "framing";
    await play(loader, [{opacity:1}, {opacity:0}], {duration:240, easing:easeOut});
    const crop = [box.top, windowBox.width - box.right, windowBox.height - box.bottom, box.left];
    const inset = "inset(" + crop.map(value => value + "px").join(" ") + ")";
    const border = "translate(" + box.left + "px," + box.top + "px) scale(" +
      box.width / windowBox.width + "," + box.height / windowBox.height + ")";
    const camera = {...settle, delay:230};
    await Promise.all([
      play(iris, [{clipPath:"inset(0px)"}, {clipPath:inset}], camera),
      play(art, [{transform:art.style.transform}, {transform:"none"}], camera),
      play(outline, [{transform:"none"}, {transform:border}], camera)
    ]);

    returnArtwork();
    root.dataset.coverIntro = "reveal";
    const cues = [
      [".mast-inner", "0 -12px", 0], [".hero-person", "28px 4px", 0],
      [".hero-copy .location", "-8px 0", 70], [".hero-copy h1", "-16px 5px", 130],
      [".hero-copy > p", "0 8px", 200], [".hero-sign", "9px 4px", 235],
      [".hero-copy .action", "0 6px", 270], [".imprint", "0 -4px", 300],
      [".secret-key:not([hidden])", "8px 0", 320]
    ];
    const reveals = [];
    for (const [selector, offset, delay] of cues) {
      const node = document.querySelector(selector);
      if (node) reveals.push(play(node, [{opacity:0, translate:offset}, {opacity:1, translate:"0 0"}],
        {duration:450, delay, easing:easeOut}));
    }
    await Promise.all(reveals);
    finish();
  }

  document.addEventListener("DOMContentLoaded", () => { start().catch(finish); }, {once:true, signal:listeners.signal});
})();

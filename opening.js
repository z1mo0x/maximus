(() => {
  const cinema = document.querySelector("#opening-cinema");
  const frame = document.querySelector(".hero-frame");
  const port = cinema.querySelector(".opening-port");
  const video = cinema.querySelector("video");
  const status = cinema.querySelector(".opening-status");
  const retry = cinema.querySelector("#opening-retry");
  let sequence = 0;
  let expanded = false;
  let heldAtStart = false;
  let needsPlay = false;

  function measureCover() {
    const box = frame.getBoundingClientRect();
    const viewport = cinema.getBoundingClientRect();
    const x = box.left - viewport.left;
    const y = box.top - viewport.top;
    const values = {
      "box-x": x, "box-y": y, "box-w": box.width, "box-h": box.height,
      "crop-left": Math.max(0, x), "crop-top": Math.max(0, y),
      "crop-right": Math.max(0, viewport.width - x - box.width),
      "crop-bottom": Math.max(0, viewport.height - y - box.height),
      "camera-x": (viewport.width - box.width) / 2 - x,
      "camera-y": (viewport.height - box.height) / 2 - y
    };
    for (const [name, value] of Object.entries(values)) cinema.style.setProperty("--" + name, value + "px");
    cinema.style.setProperty("--camera-scale", Math.max(viewport.width / box.width, viewport.height / box.height));
  }

  function cameraTransition() {
    const transition = port.getAnimations?.().find(item => item.transitionProperty === "clip-path");
    return transition?.finished.catch(() => {}) ?? Promise.resolve();
  }

  function showStatus(message, failed = false) {
    status.querySelector("[role=status]").textContent = message;
    status.hidden = !message;
    retry.hidden = !failed;
  }

  function playVideo() {
    const current = sequence;
    video.play().catch(error => {
      if (current !== sequence || error.name === "AbortError") return;
      needsPlay = true;
      updateScreen();
    });
  }

  function updateScreen() {
    if (!expanded || !cinema.open) return;
    if (video.error) {
      cinema.classList.remove("film-visible");
      showStatus("Не удалось загрузить опенинг.", true);
      return;
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA && !needsPlay) {
      showStatus("Загружается опенинг…");
      return;
    }
    showStatus("");
    cinema.classList.add("film-visible");
    if (heldAtStart) {
      heldAtStart = false;
      playVideo();
    }
  }

  async function openCinema() {
    if (cinema.open) return;
    const current = ++sequence;
    heldAtStart = false;
    needsPlay = false;
    expanded = false;
    showStatus("");
    openDialog(cinema);
    measureCover();
    // Commit the cover-sized aperture before expanding it to the viewport.
    port.getBoundingClientRect();
    frame.classList.add("showing-opening");
    cinema.classList.add("expanded");

    if (!video.hasAttribute("src")) video.src = video.dataset.src;
    else if (video.error) video.load();
    else video.currentTime = 0;
    playVideo();

    await cameraTransition();
    if (current !== sequence) return;
    expanded = true;
    updateScreen();
  }

  async function closeCinema() {
    if (!cinema.open || !cinema.classList.contains("expanded")) return;
    const current = ++sequence;
    expanded = false;
    heldAtStart = false;
    video.pause();
    if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
    if (document.fullscreenElement === video) document.exitFullscreen().catch(() => {});
    showStatus("");
    measureCover();
    cinema.classList.remove("film-visible", "expanded");
    await cameraTransition();
    if (current !== sequence) return;
    frame.classList.remove("showing-opening");
    cinema.close();
  }

  // Unlock sound with the original tap. Hold the first frame during the zoom.
  video.addEventListener("playing", () => {
    if (cinema.open && cinema.classList.contains("expanded") && !expanded) {
      heldAtStart = true;
      video.pause();
      if (video.currentTime > 0) video.currentTime = 0;
    }
  });
  video.addEventListener("canplay", updateScreen);
  video.addEventListener("error", updateScreen);
  video.addEventListener("ended", closeCinema);
  retry.addEventListener("click", () => {
    needsPlay = false;
    video.load();
    showStatus("Загружается опенинг…");
    playVideo();
  });
  for (const button of document.querySelectorAll("[data-opening]")) button.addEventListener("click", openCinema);
  cinema.querySelector(".opening-close").addEventListener("click", closeCinema);
  cinema.addEventListener("cancel", event => { event.preventDefault(); closeCinema(); });
  cinema.addEventListener("close", () => {
    if (cinema.open) return;
    ++sequence;
    video.pause();
    cinema.classList.remove("expanded", "film-visible");
    frame.classList.remove("showing-opening");
  });
  window.addEventListener("resize", () => { if (cinema.open) measureCover(); });
  window.addEventListener("pagehide", () => {
    if (cinema.open) { video.pause(); cinema.close(); }
  });
})();

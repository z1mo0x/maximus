"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
const two = number => String(number).padStart(2, "0");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const { episodes, specials, cast } = catalog;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function revealSection(target, delay = 0) {
  sectionObserver?.unobserve(target);
  target.classList.remove("awaiting-reveal");
  if (motion.matches || target.matches(":focus-within")) return;
  if (target.dataset.appear === "card") target.style.setProperty("--appear-delay", delay + "ms");
  target.classList.add("appearing");
}

const sectionObserver = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
  let cardInBatch = 0;
  for (const {target, isIntersecting} of entries) {
    if (!isIntersecting) continue;
    const delay = target.dataset.appear === "card" ? Math.min(cardInBatch++, 3) * 55 : 0;
    revealSection(target, delay);
  }
}, {rootMargin:"0px 0px -250px 0px"}) : null;

function observeSections(container) {
  if (!sectionObserver) return;
  for (const node of all("[data-appear]", container)) {
    node.classList.add("awaiting-reveal");
    sectionObserver.observe(node);
  }
}
observeSections(document);
// The last 250 pixels of the document cannot scroll past the reveal line.
if (sectionObserver) {
  const pageEnd = new IntersectionObserver(([entry]) => {
    if (entry.intersectionRatio < .9) return;
    for (const node of all(".awaiting-reveal")) {
      const bounds = node.getBoundingClientRect();
      if (bounds.bottom > 0 && bounds.top < innerHeight) revealSection(node);
    }
    pageEnd.disconnect();
  }, {threshold: .9});
  pageEnd.observe($(".foot"));
}
document.addEventListener("animationend", event => {
  if (event.animationName === "section-arrival") event.target.classList.remove("appearing");
});
document.addEventListener("focusin", event => {
  const node = event.target.closest("[data-appear]");
  if (node) {
    sectionObserver?.unobserve(node);
    node.classList.remove("awaiting-reveal", "appearing");
  }
});
motion.addEventListener("change", () => {
  if (motion.matches) all(".appearing").forEach(node => node.classList.remove("appearing"));
});

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
  document.body.classList.add("locked");
}

all("dialog").forEach(dialog => {
  dialog.addEventListener("close", () => document.body.classList.toggle("locked", Boolean($("dialog[open]"))));
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});
all("[data-close]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));

const mugPhoto = $("#mug-photo");
const mugImage = $("img", mugPhoto);
function updateMugPrint() {
  const print = $(".mug-prints input:checked");
  const source = "assets/merch/" + print.value + ".webp";
  mugPhoto.href = source;
  mugImage.src = source;
  mugImage.alt = print.dataset.alt;
}
$(".mug-prints").addEventListener("change", updateMugPrint);
window.addEventListener("pageshow", updateMugPrint);

const merchPreview = $("#merch-preview");
$(".merch-grid").addEventListener("click", event => {
  const photo = event.target.closest(".merch-photo");
  if (!photo || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const figure = photo.closest("figure");
  const print = $("input:checked", figure);
  const title = $("h3", figure).textContent;
  $("#merch-preview-title").textContent = print ? title + " · " + print.labels[0].textContent.trim() : title;
  const previewImage = $("#merch-preview-image");
  previewImage.src = photo.href;
  previewImage.alt = $("img", photo).alt;
  openDialog(merchPreview);
});

const nav = $("#navigation");
function showMenu(open) {
  nav.classList.toggle("open", open);
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
}
$("#menu-toggle").addEventListener("click", () => showMenu(!nav.classList.contains("open")));
nav.addEventListener("click", () => showMenu(false));
document.addEventListener("click", event => { if (!event.target.closest(".mast-inner")) showMenu(false); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && nav.classList.contains("open")) { showMenu(false); $("#menu-toggle").focus(); } });

const reader = $("#reader");
const episodeSelect = $("#episode-select");
const episodeList = $("#episode-list");
const picker = $(".episode-picker");
const readerScroll = $("#reader-scroll");
const sheet = $("#reader-sheet");
const sheetImage = $("#reader-page");
const mask = $("#reader-mask");
const ns = "http://www.w3.org/2000/svg";
let readerEpisodes = episodes;
let edition = 0;
let frame = 0;
let full = false;
let zoomed = false;

function svgNode(tag, attributes) {
  const node = document.createElementNS(ns, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function icon(name, extra = "") {
  const drawing = svgNode("svg", {class: "icon " + extra, viewBox: "0 0 24 24", "aria-hidden": true, focusable: false});
  drawing.append(svgNode("use", {href: "#i-" + name}));
  return drawing;
}

function populateEpisodePicker() {
  episodeList.replaceChildren(...readerEpisodes.map((episode, index) => {
    const option = element("div", "episode-option");
    option.id = "episode-option-" + episode.id;
    option.setAttribute("role", "option");
    option.append(element("span", "episode-no", two(episode.id)), element("span", "", episode.title), icon("check"));
    option.addEventListener("click", () => chooseEpisode(index));
    return option;
  }));
}

episodes.forEach((episode, index) => {
  const button = element("button");
  button.append(element("small", "", two(episode.id)), element("span", "", episode.title));
  button.addEventListener("click", () => { $("#index-dialog").close(); openReader(index); });
  $("#episode-index").append(button);
});
$("#show-index").addEventListener("click", () => openDialog($("#index-dialog")));

let activeEpisode = 0;
let searchPrefix = "";
let lastTyped = 0;

function highlightEpisode(index) {
  activeEpisode = Math.max(0, Math.min(readerEpisodes.length - 1, index));
  episodeList.querySelector(".highlighted")?.classList.remove("highlighted");
  const option = episodeList.children[activeEpisode];
  option.classList.add("highlighted");
  episodeSelect.setAttribute("aria-activedescendant", option.id);
  option.scrollIntoView({block:"nearest", behavior:"instant"});
}

function openEpisodeList() {
  episodeList.hidden = false;
  episodeSelect.setAttribute("aria-expanded", "true");
  highlightEpisode(edition);
}

function closeEpisodeList() {
  episodeList.hidden = true;
  episodeSelect.setAttribute("aria-expanded", "false");
  episodeSelect.removeAttribute("aria-activedescendant");
  searchPrefix = "";
}

function chooseEpisode(index) {
  if (index !== edition) setEdition(index);
  closeEpisodeList();
  episodeSelect.focus({preventScroll:true});
}

episodeSelect.addEventListener("click", () => {
  if (episodeList.hidden) openEpisodeList();
  else closeEpisodeList();
});
// The combobox owns keyboard focus while the listbox handles pointer selection.
episodeList.addEventListener("mousedown", event => {
  if (event.target.closest('[role="option"]')) event.preventDefault();
});
episodeSelect.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  if (key === "Tab") {
    if (!episodeList.hidden) chooseEpisode(activeEpisode);
    return;
  }
  if (key === "Escape" && episodeList.hidden) return;
  if (["Enter", " ", "Escape", "ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
    event.preventDefault();
    if (key === "Escape") { closeEpisodeList(); return; }
    if (key === "Enter" || key === " ") {
      if (episodeList.hidden) openEpisodeList(); else chooseEpisode(activeEpisode);
      return;
    }
    if (episodeList.hidden) openEpisodeList();
    if (key === "Home") highlightEpisode(0);
    else if (key === "End") highlightEpisode(readerEpisodes.length - 1);
    else highlightEpisode(activeEpisode + (key === "ArrowDown" ? 1 : -1));
  } else if (key.length === 1 && /[а-яёa-z0-9]/i.test(key)) {
    event.preventDefault();
    if (episodeList.hidden) openEpisodeList();
    const now = performance.now();
    searchPrefix = (now - lastTyped < 700 ? searchPrefix : "") + key.toLowerCase();
    lastTyped = now;
    const index = readerEpisodes.findIndex(ep => String(ep.id) === searchPrefix || two(ep.id) === searchPrefix || ep.title.toLowerCase().startsWith(searchPrefix));
    if (index >= 0) highlightEpisode(index);
  }
});
for (const eventName of ["pointerdown", "focusin"]) {
  document.addEventListener(eventName, event => {
    if (!episodeList.hidden && !picker.contains(event.target)) closeEpisodeList();
  });
}
reader.addEventListener("cancel", event => {
  if (!episodeList.hidden) { event.preventDefault(); closeEpisodeList(); }
});
reader.addEventListener("close", closeEpisodeList);

// One original page sits underneath precisely positioned paper covers.
// The unmasked masthead and gutters stay in place from the first click.
function buildSheet(episode) {
  mask.setAttribute("viewBox", "0 0 " + episode.w + " " + episode.h);
  const defs = svgNode("defs", {});
  const stock = svgNode("pattern", {id: "page-stock", patternUnits: "userSpaceOnUse", width: 128, height: 128});
  stock.append(svgNode("rect", {width: 128, height: 128, fill: "#ecdbb7"}));
  stock.append(svgNode("image", {href: "assets/grain.png", width: 128, height: 128, opacity: .07}));
  defs.append(stock);
  const covers = episode.frames.map(([x, y, right, bottom], i) => svgNode("rect", {
    class: i === 0 ? "panel-cover revealed" : "panel-cover",
    x, y, width: right - x, height: bottom - y, fill: "url(#page-stock)",
    stroke: "#bda986", "stroke-width": 1.5
  }));
  mask.replaceChildren(defs, ...covers);
  sheet.style.setProperty("--page-ratio", episode.w / episode.h);
  sheet.style.setProperty("--natural-width", episode.w + "px");
  sheetImage.width = episode.w;
  sheetImage.height = episode.h;
  sheetImage.alt = editionLabel(episode) + " «" + episode.title + "»";
  sheetImage.src = episode.src;
}

function setZoom(value) {
  zoomed = value;
  sheet.classList.toggle("enlarged", zoomed);
  const control = $("#reader-zoom");
  control.replaceChildren(icon(zoomed ? "fit" : "zoom"));
  control.setAttribute("aria-label", zoomed ? "Вместить лист в экран" : "Увеличить лист");
  control.title = control.getAttribute("aria-label");
  control.setAttribute("aria-pressed", String(zoomed));
  if (!zoomed) readerScroll.scrollTo(0, 0);
}

function editionLabel(episode) {
  return (readerEpisodes === specials ? "Спецвыпуск " : "Серия ") + two(episode.id);
}

function updateReaderControls() {
  const episode = readerEpisodes[edition];
  const lastFrame = full || frame === episode.frames.length - 1;
  $("#frame-status").textContent = full ? editionLabel(episode) + " / " + readerEpisodes.length : "Кадр " + (frame + 1) + " / " + episode.frames.length;
  $("#frame-prev").disabled = full ? edition === 0 : frame === 0;
  $("#frame-prev").setAttribute("aria-label", full ? "Предыдущая серия" : "Предыдущий кадр");
  const nextLabel = lastFrame ? (edition === readerEpisodes.length - 1 ? "Завершить чтение" : "Следующая серия") : "Следующий кадр";
  $("#frame-next").textContent = nextLabel;
  $("#full-toggle").textContent = full ? "По кадрам" : "Страница целиком";
  $("#full-toggle").setAttribute("aria-pressed", String(full));
  sheet.setAttribute("aria-label", full ? (zoomed ? "Вместить лист в экран" : "Увеличить лист") : nextLabel);
  mask.style.visibility = full ? "hidden" : "visible";
}

function setEdition(index) {
  edition = index;
  frame = 0;
  const episode = readerEpisodes[index];
  $("#episode-current").textContent = two(episode.id) + " · " + episode.title;
  for (const [i, option] of Array.from(episodeList.children).entries()) {
    option.setAttribute("aria-selected", String(i === index));
  }
  $("#reader-number").textContent = editionLabel(episode);
  $("#reader-title").textContent = episode.title;
  buildSheet(episode);
  setZoom(false);
  updateReaderControls();
}
function openReader(index = 0, collection = episodes) {
  readerEpisodes = collection;
  full = false;
  closeEpisodeList();
  $("#episode-label").textContent = readerEpisodes === specials ? "Выбрать спецвыпуск" : "Выбрать серию";
  populateEpisodePicker();
  openDialog(reader);
  setEdition(index);
  $("#frame-next").focus({preventScroll:true});
}
function advance() {
  if (full || frame === readerEpisodes[edition].frames.length - 1) {
    if (edition < readerEpisodes.length - 1) setEdition(edition + 1);
    else {
      reader.close();
      if (readerEpisodes === episodes) $("#credits").scrollIntoView({behavior: "instant"});
    }
    return;
  }
  frame++;
  const panel = mask.querySelectorAll(".panel-cover")[frame];
  panel.classList.add("revealed");
  if (zoomed) panel.scrollIntoView({block:"nearest",inline:"nearest",behavior:motion.matches ? "instant" : "smooth"});
  updateReaderControls();
}
function previousFrame() {
  if (full) { if (edition > 0) setEdition(edition - 1); return; }
  if (frame === 0) return;
  mask.querySelectorAll(".panel-cover")[frame].classList.remove("revealed");
  frame--;
  if (zoomed) mask.querySelectorAll(".panel-cover")[frame].scrollIntoView({block:"nearest",inline:"nearest"});
  updateReaderControls();
}
all("[data-read]").forEach(button => button.addEventListener("click", () => openReader()));
const specialIntro = $("#special-intro");
let specialIntroTimer;
function startSpecialReader() {
  if (!specialIntro.open) return;
  clearTimeout(specialIntroTimer);
  specialIntro.close();
  openReader(0, specials);
}
$("#open-specials").addEventListener("click", () => {
  $("#beach-panorama").src = "assets/specials/panorama.webp";
  openDialog(specialIntro);
  clearTimeout(specialIntroTimer);
  specialIntroTimer = setTimeout(startSpecialReader, motion.matches ? 850 : 2200);
});
$("#skip-special-intro").addEventListener("click", startSpecialReader);
specialIntro.addEventListener("cancel", () => clearTimeout(specialIntroTimer));
$("#full-toggle").addEventListener("click", () => { full = !full; updateReaderControls(); });
$("#reader-zoom").addEventListener("click", () => { setZoom(!zoomed); updateReaderControls(); });
sheet.addEventListener("click", () => { if (full) { setZoom(!zoomed); updateReaderControls(); } else advance(); });
$("#frame-next").addEventListener("click", advance);
$("#frame-prev").addEventListener("click", previousFrame);
reader.addEventListener("keydown", event => {
  if (picker.contains(event.target)) return;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    if (event.key === "ArrowRight") advance(); else previousFrame();
  }
});

const pollDialog = $("#poll-dialog");
function openPoll(poll) {
  $("#poll-title").textContent = "Развилка " + two(poll.id);
  const options = poll.choices.map((choice, i) => {
    const card = element("article", "poll-card " + (choice.winner ? "winner" : "lost"));
    const status = element("span", "poll-verdict");
    status.append(icon(choice.winner ? "check" : "close"), choice.winner ? "Выбор читателей" : "Не выбран");
    const head = element("div","poll-card-head");
    head.append(element("small", "", "Вариант " + two(i + 1)), status);
    const title = element("h3");
    title.append(element(choice.winner ? "span" : "del", "", choice.title));
    card.append(head, title, element("p", "", choice.description));
    return card;
  });
  $("#poll-options").replaceChildren(...options);
  openDialog(pollDialog);
  pollDialog.scrollTop = 0;
}


async function loadChoices() {
  const grid = $("#choice-grid");
  try {
    let polls = catalog.offlineChoices;
    if (location.protocol !== "file:") {
      const response = await fetch("choises.json");
      if (!response.ok) throw Error(String(response.status));
      polls = await response.json();
    }
    const stills = [3,4,6,8,13,16,19];
    const buttons = polls.map((poll, index) => {
      const button = element("button","choice");
      button.dataset.appear = "card";
      button.style.setProperty("--still",'url("assets/stills/'+two(stills[index])+'.webp")');
      const title = element("strong");
      poll.choices.filter(choice=>choice.winner).forEach(choice=>title.append(element("span","",choice.title)));
      const plus = icon("plus", "choice-plus");
      plus.setAttribute("aria-hidden","true");
      button.append(element("span","choice-meta","Развилка " + two(poll.id)),title,plus);
      button.setAttribute("aria-haspopup","dialog");
      button.addEventListener("click",()=>openPoll(poll));
      return button;
    });
    grid.replaceChildren(...buttons);
    observeSections(grid);
  } catch {
    const retry = element("button","text-button","Загрузить выборы ещё раз");
    retry.addEventListener("click",loadChoices);
    grid.replaceChildren(retry);
  }
}
loadChoices();

const castSection = $("#heroes");
const stage = $("#cast-stage");
let castIndex = -1;
let castTick = false;
let stageVisible = false;
let revision = 0;

function showCast(index) {
  if (index === castIndex || !cast[index]) return;
  castIndex = index;
  const current = ++revision;
  const hero = cast[index];
  const scene = element("article", "actor " + (index % 2 ? "portrait-right" : "portrait-left"));
  scene.setAttribute("aria-label", hero.name);
  const setting = element("img","actor-setting");
  setting.alt = ""; setting.src = hero.scene;
  const slice = element("div", "actor-slice");
  const portrait = element("img", "actor-portrait");
  portrait.alt = hero.name; portrait.src = hero.image;
  slice.append(portrait);
  const copy = element("div", "actor-copy");
  const tag = element("div", "actor-nameplate");
  tag.append(element("h3", "actor-name", hero.name), element("p","actor-role",hero.role));
  copy.append(tag, element("p", "actor-bio", hero.bio));
  scene.append(setting, slice, copy);
  $("#cast-counter").textContent = two(index + 1) + " / " + two(cast.length);
  $("#cast-progress").style.transform = "scaleX(" + ((index + 1) / cast.length) + ")";
  $("#cast-prev").disabled = index === 0;
  $("#cast-next").disabled = index === cast.length - 1;
  // Keep the previous illustration on screen until the requested pair is decoded.
  // Discard stale loads when the reader scrolls quickly across multiple characters.
  Promise.allSettled([portrait.decode(), setting.decode()]).then(() => {
    if (current !== revision) return;
    const old = stage.querySelector(".actor:not(.leaving)");
    stage.querySelector(".leaving")?.remove();
    if (old && stageVisible && !motion.matches) {
      old.classList.add("leaving");
      old.setAttribute("aria-hidden","true");
      old.animate([{opacity:1,transform:"translateX(0)"},{opacity:0,transform:"translateX(" + (old.classList.contains("portrait-left") ? "-11%" : "11%") + ")"}],
        {duration:245,easing:"cubic-bezier(.55,0,.9,.4)",fill:"forwards"}).finished.then(()=>old.remove(),()=>old.remove());
    } else old?.remove();
    if (stageVisible) scene.classList.add("entering");
    stage.append(scene);
    if (stageVisible) {
      const neighbor = cast[index + 1];
      if (neighbor) { const nextFace = new Image(); nextFace.src = neighbor.image; const nextScene = new Image(); nextScene.src = neighbor.scene; }
    }
  });
}

new IntersectionObserver(([entry]) => {
  stageVisible = entry.isIntersecting;
  if (stageVisible) stage.querySelector(".actor:not(.leaving)")?.classList.add("entering");
}, {threshold:.12}).observe(stage);

function castTravel() {
  return castSection.offsetHeight - $(".cast-pin").offsetHeight;
}
function readCastScroll() {
  castTick = false;
  if (!castSection.classList.contains("pinned") || document.body.classList.contains("locked")) return;
  const progress = Math.max(0, Math.min(1, -castSection.getBoundingClientRect().top / Math.max(1, castTravel())));
  showCast(Math.round(progress * (cast.length - 1)));
}
function goToCast(index) {
  const target = Math.max(0, Math.min(cast.length - 1, index));
  if (castSection.classList.contains("pinned")) {
    const top = scrollY + castSection.getBoundingClientRect().top + castTravel() * target / (cast.length - 1);
    window.scrollTo({top, behavior:"instant"});
  }
  showCast(target);
}
$("#cast-prev").addEventListener("click", () => goToCast(castIndex - 1));
$("#cast-next").addEventListener("click", () => goToCast(castIndex + 1));
document.addEventListener("keydown", event => {
  if (!["ArrowLeft","ArrowRight"].includes(event.key) || $("dialog[open]") || event.altKey || event.ctrlKey || event.metaKey) return;
  if (!castSection.contains(event.target) && !(event.target === document.body && stageVisible)) return;
  event.preventDefault();
  goToCast(castIndex + (event.key === "ArrowLeft" ? -1 : 1));
});
function configureCast() {
  const fits = innerHeight >= (innerWidth <= 650 ? 580 : 445);
  castSection.classList.toggle("pinned", !motion.matches && fits);
  if (castIndex === -1) showCast(0);
  readCastScroll();
}
window.addEventListener("scroll", () => {
  if (!castTick) { castTick = true; requestAnimationFrame(readCastScroll); }
}, {passive:true});
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(configureCast,100); });
motion.addEventListener("change", configureCast);
configureCast();


if (new URLSearchParams(location.search).get("maxon") === "yes") {
  const key = $("#secret-key");
  key.hidden = false;
  key.addEventListener("click",()=>openDialog($("#secret-dialog")));
}
$("#copy-secret").addEventListener("click",async()=>{
  try {
    await navigator.clipboard.writeText($("#secret-prompt").textContent);
    $("#copy-status").textContent = "Инструкция скопирована.";
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents($("#secret-prompt"));selection.removeAllRanges();selection.addRange(range);
    $("#copy-status").textContent = "Текст выделен. Используй команду «Копировать».";
  }
});

// Rain belongs to the background layer and pauses outside the cover.
const canvas = $("#rain");
const context = canvas.getContext("2d");
if (context) {
  const drops = Array.from({length:70},()=>({x:Math.random(),y:Math.random(),speed:.65+Math.random()*.7,length:5+Math.random()*11}));
  let visible = false, request = 0, previous = 0;
  let width = 0, height = 0;
  function sizeRain() {
    width = canvas.clientWidth; height = canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio||1,2);
    canvas.width = width*ratio; canvas.height = height*ratio; context.setTransform(ratio,0,0,ratio,0,0);
  }
  function paint(time) {
    const delta = previous ? Math.min(40,time-previous) : 0; previous = time;
    context.clearRect(0,0,width,height);context.lineWidth=1;context.strokeStyle="rgba(195,210,207,.54)";context.beginPath();
    for(const drop of drops) {
      drop.y += delta*drop.speed*.00043;drop.x -= delta*drop.speed*.000036;
      if (drop.y>1.04) drop.y=-.04;
      if (drop.x<0) drop.x=1;
      const x=drop.x*width,y=drop.y*height;
      context.moveTo(x,y);context.lineTo(x-3,y+drop.length);
    }
    context.stroke();request=requestAnimationFrame(paint);
  }
  function toggleRain() {
    cancelAnimationFrame(request);previous=0;
    if(visible && !document.hidden && !motion.matches) request=requestAnimationFrame(paint);
    else context.clearRect(0,0,width,height);
  }
  new ResizeObserver(sizeRain).observe(canvas);
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;toggleRain();}).observe(canvas);
  document.addEventListener("visibilitychange",toggleRain);motion.addEventListener("change",toggleRain);
}

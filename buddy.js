/*
 * buddy.js: a tiny pixel buddy for any web app. One PNG per pose, two moves, no dependencies.
 *
 *   <div id="buddy-host"></div>
 *   <script src="buddy.js"></script>
 *   const b = Buddy.create(document.getElementById("buddy-host"), { src: "buddy.png", alt: "", height: 48 });
 *   b.play("hop");          // "idle" or "hop"; each move plays a few times, then stops
 *   b.pose("watching.png"); // swap to another real frame (a status pose), no effect added
 *   b.destroy();            // removes the element
 *
 * Options: src, alt, height (CSS px, rounded down to a whole-number multiple of the PNG),
 *   hop (rise in px, default 8: the old 40 was too tall next to a tab bar),
 *   hops (how many times a hop plays, default 1),
 *   injectStyle (default true; pass false and load buddy.css when the CSP has style-src 'self').
 *
 * Rules built in:
 * - pointer-events are off, so the buddy never blocks a tap. Wrap it in a real <button> if it must be tappable.
 * - Moves are CSS transforms on the image only, with steps() timing.
 * - Reduced motion stops all movement; pose swaps still happen, instantly.
 * - No timers run on their own; a move ends with its CSS animation.
 * - Only transform changes. Power-ups and other effects need real frames, not CSS.
 */
(function (global) {
  "use strict";

  var STYLE_ID = "buddy-js-style";
  var CSS = [
    ".pixel-buddy { position: relative; display: inline-flex; align-items: flex-end; justify-content: center; pointer-events: none; }",
    ".pixel-buddy img { image-rendering: pixelated; image-rendering: crisp-edges; display: block; width: auto; transform-origin: 50% 100%; }",
    ".pixel-buddy.idle img { animation: buddy-breathe 1.2s steps(2, end) 3; }",
    ".pixel-buddy.hop img { animation: buddy-hop .9s steps(1, end) var(--buddy-hops, 1); }",
    "@keyframes buddy-breathe { 0% { transform: translateY(0); } 50% { transform: translateY(-2px); } 100% { transform: translateY(0); } }",
    "@keyframes buddy-hop { 0% { transform: scale(1.14, .82); } 25% { transform: translateY(calc(-1 * var(--buddy-hop, 8px))) scale(.9, 1.12); } 55% { transform: translateY(calc(-1 * var(--buddy-hop, 8px))) scale(1, 1); } 75% { transform: translateY(0) scale(1.12, .86); } 100% { transform: translateY(0) scale(1, 1); } }",
    "@media (prefers-reduced-motion: reduce) { .pixel-buddy img { animation: none !important; } }"
  ].join("\n");

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function create(host, opts) {
    if (!host || !opts || !opts.src) throw new Error("Buddy.create needs a host element and opts.src");
    if (opts.injectStyle !== false) ensureStyle();
    var target = opts.height || 48;
    var root = document.createElement("div");
    root.className = "pixel-buddy idle";
    root.style.setProperty("--buddy-hop", (opts.hop == null ? 8 : opts.hop) + "px");
    root.style.setProperty("--buddy-hops", String(opts.hops || 1));
    var img = document.createElement("img");
    img.alt = opts.alt || "";
    img.style.visibility = "hidden"; // no flash at natural size
    // Whole-number scale once the PNG's natural size is known, then show it.
    img.addEventListener("load", function () {
      var nh = img.naturalHeight || 1;
      img.style.height = (Math.max(1, Math.floor(target / nh)) * nh) + "px";
      img.style.visibility = "visible";
    });
    img.addEventListener("error", function () {
      if (global.console) console.warn("buddy: could not load " + img.src + " (check the path, img-src and style-src)");
    });
    img.src = opts.src;
    root.appendChild(img);
    host.appendChild(root);

    function restart() {
      img.style.animation = "none";
      void img.offsetWidth;
      img.style.animation = "";
    }

    return {
      el: root,
      play: function (move) {
        if (move !== "idle" && move !== "hop") return;
        root.className = "pixel-buddy " + move;
        restart(); // restart the same move when it is asked for again
      },
      pose: function (src) {
        if (src && img.getAttribute("src") !== src) img.src = src;
      },
      destroy: function () {
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  global.Buddy = { create: create };
})(typeof window !== "undefined" ? window : globalThis);

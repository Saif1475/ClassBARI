"use client";

import { useEffect } from "react";

/**
 * Apple-style sliding selection, site-wide. Any element with `data-slide` is a single-choice group (tabs, menus,
 * toggles). Its selected item (aria-current="page" / aria-pressed="true" / aria-selected="true") normally paints its
 * own highlight; here that highlight is lifted into one "pill" per group that glides to the new item instead of jumping.
 * The pill copies the item's own colour, shape and shadow, so every group keeps its look.
 * Single-choice groups only: multi-select toggles (several pressed at once) must not use data-slide.
 */
const ACTIVE = '[aria-current="page"], [aria-pressed="true"], [aria-selected="true"]';
const clear = (c: string) => !c || c === "transparent" || c === "rgba(0, 0, 0, 0)";

type Group = HTMLElement & { _pill?: HTMLElement; _target?: HTMLElement | null };

/** An element's real look: without our overrides and without a colour fade in progress. */
function realLook(el: HTMLElement) {
  const saved = [el.style.backgroundColor, el.style.boxShadow, el.style.transition];
  el.style.transition = "none";
  el.style.removeProperty("background-color");
  el.style.removeProperty("box-shadow");
  const cs = getComputedStyle(el);
  const look = { background: cs.backgroundColor, borderRadius: cs.borderRadius, boxShadow: cs.boxShadow };
  [el.style.backgroundColor, el.style.boxShadow, el.style.transition] = saved;
  return look;
}

/** The element that actually shows the highlight: the item itself, or its first child with a background (icon pill). */
function highlightOf(item: HTMLElement) {
  if (!clear(realLook(item).background)) return item;
  for (const el of item.querySelectorAll<HTMLElement>("span, div")) if (!clear(realLook(el).background)) return el;
  return null;
}

function place(group: Group) {
  const item = group.querySelector<HTMLElement>(ACTIVE);
  const target = item ? highlightOf(item) : null;
  if (group._target && group._target !== target) {
    group._target.style.removeProperty("background-color");
    group._target.style.removeProperty("box-shadow");
  }
  let pill = group._pill;
  if (!pill || !group.contains(pill)) {
    pill = document.createElement("span");
    pill.className = "slide-pill";
    pill.setAttribute("aria-hidden", "true");
    group.append(pill);
    group._pill = pill;
    if (getComputedStyle(group).position === "static") group.style.position = "relative";
    group.style.isolation = "isolate"; // pill sits above the group's background, below its items
  }
  const g = group.getBoundingClientRect();
  const r = target?.getBoundingClientRect();
  if (!target || !r || !r.width || !g.width) {
    pill.style.opacity = "0";
    group._target = null;
    return;
  }
  const look = realLook(target);
  const first = !group._target && pill.style.opacity !== "1";
  if (first) pill.style.transition = "none"; // appear in place, then glide from the next change on
  pill.style.backgroundColor = look.background; // colour only: the 3D glass sheen (CSS) is a background-image on top
  pill.style.borderRadius = look.borderRadius;
  pill.style.boxShadow = look.boxShadow;
  pill.style.width = `${r.width}px`;
  pill.style.height = `${r.height}px`;
  pill.style.transform = `translate(${r.left - g.left - group.clientLeft + group.scrollLeft}px, ${r.top - g.top - group.clientTop + group.scrollTop}px)`;
  pill.style.opacity = "1";
  target.style.backgroundColor = "transparent";
  target.style.boxShadow = "none";
  group._target = target;
  if (first) requestAnimationFrame(() => pill.style.removeProperty("transition"));
}

export function SlideIndicator() {
  useEffect(() => {
    let busy = false;
    const all = () => {
      if (busy) return; // our own style changes trigger the observer once more; ignore them
      busy = true;
      document.querySelectorAll<Group>("[data-slide]").forEach(place);
      queueMicrotask(() => (busy = false));
    };
    // Observer callbacks run before the browser paints, so the old highlight never flashes.
    const mo = new MutationObserver(all);
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-current", "aria-pressed", "aria-selected", "class"] });
    let frame = 0;
    const later = () => (cancelAnimationFrame(frame), (frame = requestAnimationFrame(all)));
    window.addEventListener("resize", later);
    // A menu that slides in is measured mid-slide: measure again once it has stopped, or the highlight sits beside its item.
    document.addEventListener("animationend", later, true);
    document.fonts?.ready.then(later);
    all();
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", later);
      document.removeEventListener("animationend", later, true);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

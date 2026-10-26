import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { IconButton } from "./ui.jsx";

// Only the menu scrolls; the clinic header stays visible at every screen height.
export default function SidebarMenu({ children }) {
  const frameRef = useRef(null);
  const scrollRef = useRef(null);
  const [position, setPosition] = useState({
    overflow: false,
    up: false,
    down: false,
  });

  const updatePosition = useCallback(() => {
    const frame = frameRef.current;
    const menu = scrollRef.current;
    if (!frame || !menu) return;
    const overflow = menu.scrollHeight > frame.clientHeight + 1;
    const maximum = Math.max(0, menu.scrollHeight - menu.clientHeight);
    const next = {
      overflow,
      up: overflow && menu.scrollTop > 1,
      down: overflow && menu.scrollTop < maximum - 1,
    };
    setPosition((previous) =>
      previous.overflow === next.overflow &&
      previous.up === next.up &&
      previous.down === next.down
        ? previous
        : next,
    );
  }, []);

  useEffect(() => {
    const menu = scrollRef.current;
    const frame = frameRef.current;
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(frame);
    observer.observe(menu);
    for (const child of menu.children) observer.observe(child);
    return () => observer.disconnect();
  }, [updatePosition]);

  const move = (direction) => {
    const menu = scrollRef.current;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    menu.scrollBy({
      top: direction * Math.max(80, menu.clientHeight - 45),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  const keyboard = (event) => {
    if (event.target !== event.currentTarget) return;
    const menu = scrollRef.current;
    const targets = {
      ArrowDown: menu.scrollTop + 42,
      ArrowUp: menu.scrollTop - 42,
      PageDown: menu.scrollTop + menu.clientHeight - 35,
      PageUp: menu.scrollTop - menu.clientHeight + 35,
      Home: 0,
      End: menu.scrollHeight,
    };
    if (Object.hasOwn(targets, event.key)) {
      event.preventDefault();
      menu.scrollTo({ top: targets[event.key], behavior: "auto" });
    }
  };

  return (
    <div className="sidebar-menu" ref={frameRef}>
      <div
        className="sidebar-scroll"
        id="clinic-menu-scroll"
        ref={scrollRef}
        role="region"
        aria-label="Scrollable clinic menu"
        tabIndex={0}
        onScroll={updatePosition}
        onKeyDown={keyboard}
      >
        {children}
      </div>
      {position.overflow && (
        <div className="sidebar-scroll-controls">
          <span>Scroll menu</span>
          <IconButton
            icon={ChevronUp}
            label="Scroll menu up"
            aria-controls="clinic-menu-scroll"
            disabled={!position.up}
            onClick={() => move(-1)}
          />
          <IconButton
            icon={ChevronDown}
            label="Scroll menu down"
            aria-controls="clinic-menu-scroll"
            disabled={!position.down}
            onClick={() => move(1)}
          />
        </div>
      )}
    </div>
  );
}

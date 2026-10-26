import assert from "node:assert/strict";

// Check actual rendered text against its composite surface, not just token names.
export async function checkReadability(page, label, rootSelector = "body") {
  await page.waitForFunction((selector) => {
    const root = document.querySelector(selector);
    return (
      root &&
      getComputedStyle(root).opacity === "1" &&
      root.getBoundingClientRect().width > 0
    );
  }, rootSelector);
  const result = await page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return { checked: 0, violations: [{ missing: selector }] };
    const parse = (value) => {
      const parts = value.match(/[\d.]+/g)?.map(Number);
      return parts?.length >= 3
        ? [parts[0], parts[1], parts[2], parts[3] ?? 1]
        : [0, 0, 0, 1];
    };
    const composite = (foreground, background) =>
      foreground
        .slice(0, 3)
        .map(
          (value, index) =>
            value * foreground[3] + background[index] * (1 - foreground[3]),
        );
    const luminance = (value) =>
      value
        .map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    const backdrop = (element) => {
      const parents = [];
      for (let item = element; item; item = item.parentElement)
        parents.push(item);
      return parents
        .reverse()
        .reduce(
          (background, item) =>
            composite(
              parse(getComputedStyle(item).backgroundColor),
              background,
            ),
          [255, 255, 255],
        );
    };
    const visible = (element) => {
      if (
        element.closest(
          '[aria-hidden="true"], .modal-hidden, .template-thumbnail, [disabled]',
        )
      )
        return false;
      if (
        element.closest(".sidebar") &&
        !document.querySelector(".sidebar")?.getBoundingClientRect().right
      )
        return false;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.right <= 0 || rect.bottom <= 0)
        return false;
      for (let item = element; item; item = item.parentElement) {
        const style = getComputedStyle(item);
        if (
          style.display === "none" ||
          style.visibility !== "visible" ||
          Number(style.opacity) < 0.99
        )
          return false;
      }
      return true;
    };
    const violations = [];
    let checked = 0;
    const inspect = (element, text, pseudo = null) => {
      if (!visible(element)) return;
      const style = getComputedStyle(element, pseudo);
      const background = backdrop(element);
      const color = parse(
        element.tagName.toLowerCase() === "text" ? style.fill : style.color,
      );
      const foreground = composite(color, background);
      const lum = [luminance(foreground), luminance(background)].sort(
        (a, b) => b - a,
      );
      const contrast = (lum[0] + 0.05) / (lum[1] + 0.05);
      const size = parseFloat(style.fontSize);
      const metadata = element.closest(
        ".nav-label, .sidebar-version, .nav-item small",
      );
      checked++;
      if (contrast < 4.5 || (size < 12 && !metadata))
        violations.push({
          text: text.trim().slice(0, 65),
          element: element.tagName + "." + element.getAttribute("class"),
          contrast: Number(contrast.toFixed(2)),
          size,
          color: style.color,
          background,
        });
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (
        node.textContent.trim() &&
        !node.parentElement.closest("script, style, option")
      )
        inspect(node.parentElement, node.textContent);
    }
    for (const element of root.querySelectorAll(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea',
    )) {
      if (element.value) inspect(element, element.value);
      else if (element.placeholder)
        inspect(element, element.placeholder, "::placeholder");
    }
    return { checked, violations };
  }, rootSelector);
  assert.ok(result.checked > 0, "No visible text checked: " + label);
  assert.deepEqual(result.violations, [], label + " has faint or tiny text");
  return result.checked;
}

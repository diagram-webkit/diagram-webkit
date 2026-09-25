// Tag groups, the tag tree
// (branch and self toggles, bulk controls, filter, default expansion) and
// description tooltips.
import { escapeHTML } from "../core/html";
import { formatText } from "../core/texts";
import { getScale } from "../dom/context.js";
import { createLevelSlider } from "./level-slider.js";

const TAG_TREE_LAYOUT = "tree";
// Height budget for the default expansion. A row is one tag line; the
// reserve is the space the result list must keep below the tree.
export const TAG_TREE_ROW_HEIGHT_PX = 30;
export const TAG_TREE_RESULTS_RESERVE_RATIO = 0.4;
export const TAG_TREE_RESULTS_RESERVE_MAX_PX = 200;
export const TAG_TREE_RESIZE_DEBOUNCE_MS = 150;
export const TAG_TOOLTIP_MIN_WIDTH_PX = 1000;
const TAG_TOOLTIP_GAP_PX = 10;
const MAX_ORDER = Number.MAX_SAFE_INTEGER;

export function createTagTree(ctx) {
  const s = ctx.s;
  const sv = ctx.services;
  const model = ctx.model;
  const texts = ctx.texts;
  const controls = ctx.el("filter-tag-controls");
  const expandedTagPaths = new Set();
  let tagTreeFilterQuery = "";
  // Once the reader expands or collapses a node themselves, the height rule
  // stops overruling them for the rest of the session.
  let tagTreeManualOverride = false;
  let applyTagTreeHeightDefault = null;
  let currentTagTreeRefresh = null;
  let levelSlider = null;
  let resizeTimeout = 0;
  let buildController = null;
  const tagTooltips = new Set();
  // "Dim others" beside Show all / Hide all / Invert (tree groups).
  const dimButtons = new Set();

  const label = (tag, meta) => (ctx.config.tagLabel ? ctx.config.tagLabel(tag, meta) : meta.label || tag);
  const elementCount = (count) => formatText(count === 1 ? texts.elementCountOne : texts.elementCountMany, { count });

  function isTagHidden(tag) {
    return s.tagVisibility.get(tag) === false;
  }

  function getHiddenAncestor(tag) {
    return model.getHiddenAncestor(tag, s.tagVisibility);
  }

  function isTagEffectivelyHidden(tag) {
    return isTagHidden(tag) || Boolean(getHiddenAncestor(tag));
  }

  function updateTagToggleVisual(tag, toggle) {
    toggle.classList.toggle("active", s.tagVisibility.get(tag) !== false);
  }

  function applyTagButtonStyle(tag, button) {
    const style = model.getTagMeta(tag).style;
    if (!style) return;
    ["background", "color", "borderColor", "borderWidth", "borderStyle", "fontWeight"].forEach((key) => {
      if (style[key]) button.style[key] = style[key];
    });
  }

  function setTagHidden(tag, hidden) {
    sv.filter.clearOnlyTags();
    sv.filter.setTagHidden(tag, hidden);
  }

  function commitTagChange(onToggled) {
    sv.filter.applyAnnotationFilter();
    if (onToggled) onToggled();
    renderFocusState();
    sv.urlSync.updateURLState();
  }

  // Small text buttons on a tree row: shown on hover, and while on.
  function createRowAction(className, text, tag, onClick, signal) {
    const button = ctx.doc.createElement("button");
    button.type = "button";
    button.className = `tag-row-action ${className}`;
    button.dataset.tag = tag;
    button.textContent = text;
    button.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        if (!button.disabled) onClick();
      },
      { signal },
    );
    return button;
  }

  function createFocusButton(tag, signal) {
    return createRowAction("tag-focus-btn", texts.tagFocus, tag, () => sv.focus.toggle(tag), signal);
  }

  // Every focus button, and "Dim others" (only with something in focus).
  function renderFocusState() {
    const focused = sv.focus.tags();
    dimButtons.forEach((button) => {
      const on = focused.length > 0 && sv.focus.mode() === "dim-others";
      button.disabled = focused.length === 0;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.title = focused.length === 0 ? texts.tagTreeDimOthersNoFocus : texts.tagTreeDimOthersTitle;
    });
    controls.querySelectorAll(".tag-focus-btn").forEach((button) => {
      const tag = button.dataset.tag;
      const on = sv.focus.has(tag);
      const focusable = sv.focus.isFocusable(tag);
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.disabled = !on && !focusable;
      button.title = !on && !focusable ? texts.focusTagHidden : formatText(on ? texts.focusTagOff : texts.focusTagOn, { path: tag });
    });
  }



  // Ancestors are on every cell (METADATA.md R3), so hiding a parent hides
  // its whole branch, and its children follow it. Showing it shows the
  // branch again, children hidden on their own included.
  function hideTagBranch(tag) {
    setTagHidden(tag, true);
  }

  function showTagBranch(tag, descendantTags) {
    setTagHidden(tag, false);
    descendantTags.forEach((descendant) => setTagHidden(descendant, false));
  }

  function createTagToggle(tag, text, onToggled, descendantTags, signal) {
    const toggle = ctx.doc.createElement("button");
    toggle.type = "button";
    toggle.className = "tag-filter-btn";
    toggle.dataset.tag = tag;
    toggle.textContent = text;
    applyTagButtonStyle(tag, toggle);
    updateTagToggleVisual(tag, toggle);
    toggle.addEventListener(
      "click",
      () => {
        // A child of a hidden parent is not clickable; the parent decides.
        if (getHiddenAncestor(tag)) return;
        if (isTagHidden(tag)) showTagBranch(tag, descendantTags);
        else hideTagBranch(tag);
        updateTagToggleVisual(tag, toggle);
        commitTagChange(onToggled);
      },
      { signal },
    );
    return toggle;
  }

  function renderFlatTagGroup(groupWrap, tags, signal) {
    const buttons = ctx.doc.createElement("div");
    buttons.className = "tag-group-buttons";
    tags.forEach((tag) => buttons.appendChild(createTagToggle(tag, label(tag, model.getTagMeta(tag)), null, [], signal)));
    groupWrap.appendChild(buttons);
  }

  function buildTagTree(tags) {
    const nodes = new Map();
    const ensureNode = (path) => {
      if (nodes.has(path)) return nodes.get(path);
      const node = { path, isTag: false, children: [] };
      nodes.set(path, node);
      const parentPath = model.getTagParent(path);
      if (parentPath) ensureNode(parentPath).children.push(node);
      return node;
    };
    tags.forEach((tag) => {
      ensureNode(tag).isTag = true;
    });
    const sortNodes = (list) => {
      list.sort((a, b) => a.path.localeCompare(b.path));
      list.forEach((node) => sortNodes(node.children));
      return list;
    };
    return sortNodes(Array.from(nodes.values()).filter((node) => !model.getTagParent(node.path)));
  }

  function getTreeNodeLabel(node) {
    const meta = model.getTagMeta(node.path);
    if (ctx.config.tagLabel) return ctx.config.tagLabel(node.path, meta);
    return meta.label && meta.label !== node.path ? meta.label : model.getTagLeafName(node.path);
  }

  function getTagElementCount(tag) {
    const elements = s.diagramTagElements.get(tag);
    return elements ? elements.length : 0;
  }

  function setTagsVisibility(tags, visible) {
    sv.filter.clearOnlyTags();
    tags.forEach((tag) => {
      s.tagVisibility.set(tag, visible);
      sv.filter.applyTagVisibility(tag);
    });
    sv.filter.applyAnnotationFilter();
    renderFocusState();
    sv.urlSync.updateURLState();
  }

  function invertTags(tags) {
    sv.filter.clearOnlyTags();
    tags.forEach((tag) => {
      s.tagVisibility.set(tag, isTagHidden(tag));
      sv.filter.applyTagVisibility(tag);
    });
    sv.filter.applyAnnotationFilter();
    renderFocusState();
    sv.urlSync.updateURLState();
  }

  function getDescendantTags(node) {
    return node.children.flatMap((child) => [...(child.isTag ? [child.path] : []), ...getDescendantTags(child)]);
  }

  function createTagTreeHeader(groupTitle, handlers, signal) {
    const headerRow = ctx.doc.createElement("div");
    headerRow.className = "tag-tree-header-row";
    const header = ctx.doc.createElement("button");
    header.type = "button";
    header.className = "tag-tree-header";
    const caret = ctx.doc.createElement("span");
    caret.className = "tag-tree-caret";
    const meta = ctx.doc.createElement("span");
    meta.className = "tag-tree-meta";
    header.append(caret, groupTitle.cloneNode(true), meta);
    header.addEventListener("click", handlers.onToggle, { signal });

    const reset = ctx.doc.createElement("button");
    reset.type = "button";
    reset.className = "tag-tree-link";
    reset.textContent = texts.tagTreeReset;
    reset.title = texts.tagTreeResetTitle;
    reset.addEventListener("click", handlers.onReset, { signal });

    // Bulk controls act on every tag in the group, expanded or not.
    const bulk = ctx.doc.createElement("div");
    bulk.className = "tag-tree-bulk";
    const bulkButtons = [
      { text: texts.tagTreeShowAll, title: texts.tagTreeShowAllTitle, handler: handlers.onShowAll },
      { text: texts.tagTreeHideAll, title: texts.tagTreeHideAllTitle, handler: handlers.onHideAll },
      { text: texts.tagTreeInvert, title: texts.tagTreeInvertTitle, handler: handlers.onInvert },
      { text: texts.tagTreeDimOthers, title: texts.tagTreeDimOthersTitle, handler: handlers.onDimOthers },
    ].map(({ text, title, handler }) => {
      const button = ctx.doc.createElement("button");
      button.type = "button";
      button.className = "tag-tree-bulk-btn";
      button.textContent = text;
      button.title = title;
      button.addEventListener("click", handler, { signal });
      bulk.appendChild(button);
      return button;
    });

    headerRow.append(header, reset);
    groupTitle.replaceWith(headerRow);
    headerRow.after(bulk);
    bulkButtons[3].classList.add("tag-tree-dim-btn");
    dimButtons.add(bulkButtons[3]);
    return { header, meta, reset, bulk, showAllBtn: bulkButtons[0], hideAllBtn: bulkButtons[1] };
  }

  // How many tag rows fit above the result list. The tree is worth expanding
  // only while the results it filters stay in view.
  function countTagTreeRowsThatFit(panel) {
    const body = panel.closest(".filter-panel-body");
    if (!body) return 0;
    const scale = getScale(ctx.root);
    const bodyRect = body.getBoundingClientRect();
    const bodyHeight = bodyRect.height / scale;
    if (!(bodyHeight > 0)) return 0;
    const reserve = Math.min(TAG_TREE_RESULTS_RESERVE_MAX_PX, bodyHeight * TAG_TREE_RESULTS_RESERVE_RATIO);
    const panelTop = (panel.getBoundingClientRect().top - bodyRect.top) / scale;
    return Math.max(0, Math.floor((bodyHeight - panelTop - reserve) / TAG_TREE_ROW_HEIGHT_PX));
  }

  // Tag descriptions come from the definition, so the tree row can explain a
  // tag without the taxonomy being duplicated into the diagram.
  function buildTagTooltipHtml(node) {
    const description = model.getTagDescription(node.path);
    const count = node.isTag ? getTagElementCount(node.path) : 0;
    const descriptionHtml = description ? `<br>${escapeHTML(description)}` : "";
    return `<b>${escapeHTML(node.path)}</b>${descriptionHtml}<br><small>${escapeHTML(elementCount(count))}</small>`;
  }

  // Wide containers only: on a phone the panel is the whole screen, so there
  // is no "beside the menu" to put this in.
  function canShowTagTooltip() {
    return ctx.root.clientWidth > TAG_TOOLTIP_MIN_WIDTH_PX && ctx.win.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  // The box lives on the root, not in the tooltip layer: that layer sits
  // under the panel, so the description came out underneath the menu.
  function positionTagTooltip(tooltip, row) {
    const scale = getScale(ctx.root);
    const view = ctx.root.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const panelRect = controls.closest(".filter-panel").getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const toLocalX = (x) => (x - view.left) / scale;
    const toLocalY = (y) => (y - view.top) / scale;
    const width = tooltipRect.width / scale;
    const height = tooltipRect.height / scale;
    let left = toLocalX(panelRect.left) - width - TAG_TOOLTIP_GAP_PX;
    if (left < TAG_TOOLTIP_GAP_PX) left = TAG_TOOLTIP_GAP_PX;
    const top = Math.max(
      TAG_TOOLTIP_GAP_PX,
      Math.min(toLocalY(rowRect.top + rowRect.height / 2) - height / 2, ctx.root.clientHeight - height - TAG_TOOLTIP_GAP_PX),
    );
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function bindTagDescriptionTooltip(row, node, signal) {
    let tooltip = null;
    let hideTimeout = 0;
    const ensureTooltip = () => {
      if (tooltip) return tooltip;
      tooltip = ctx.doc.createElement("div");
      tooltip.className = "tooltip-box tag-description-tooltip";
      tooltip.innerHTML = buildTagTooltipHtml(node);
      tooltip.style.display = "none";
      ctx.root.appendChild(tooltip);
      tagTooltips.add(tooltip);
      return tooltip;
    };
    row.addEventListener(
      "mouseenter",
      () => {
        if (!canShowTagTooltip()) return;
        ctx.timers.clearTimeout(hideTimeout);
        const element = ensureTooltip();
        element.style.display = "block";
        positionTagTooltip(element, row);
      },
      { signal },
    );
    row.addEventListener(
      "mouseleave",
      () => {
        if (!tooltip) return;
        ctx.timers.clearTimeout(hideTimeout);
        hideTimeout = ctx.timers.setTimeout(() => {
          tooltip.style.display = "none";
        }, ctx.config.ui.tooltipHideDelay);
      },
      { signal },
    );
  }

  function renderTagTreeGroup(groupWrap, groupTitle, tags, signal) {
    const filterInput = ctx.doc.createElement("input");
    filterInput.type = "search";
    filterInput.className = "tag-tree-filter";
    filterInput.placeholder = texts.tagFilterPlaceholder;
    filterInput.autocomplete = "off";
    filterInput.setAttribute("aria-label", texts.tagFilterLabel);
    filterInput.value = tagTreeFilterQuery;

    const tree = ctx.doc.createElement("div");
    tree.className = "tag-tree";
    const emptyMessage = ctx.doc.createElement("small");
    emptyMessage.className = "tag-tree-empty";
    emptyMessage.textContent = texts.tagFilterEmpty;
    const panel = ctx.doc.createElement("div");
    panel.className = "tag-tree-panel tag-tree-collapsible";
    const panelInner = ctx.doc.createElement("div");
    panelInner.className = "tag-tree-collapsible-inner";
    panelInner.append(tree, emptyMessage);
    panel.appendChild(panelInner);

    const views = new Map();
    const roots = buildTagTree(tags);
    const refresh = () => refreshTagTree(roots, views, emptyMessage, listView, tree);
    currentTagTreeRefresh = refresh;
    const listView = {
      panel,
      tags,
      ...createTagTreeHeader(
        groupTitle,
        {
          onToggle: () => {
            if (tagTreeFilterQuery.trim()) return;
            s.tagTreeExpanded = !s.tagTreeExpanded;
            refreshTagTreeDefaultState();
            refresh();
            sv.urlSync.updateURLState();
          },
          // All tag state: visibility, focus and its effect.
          onReset: () => {
            setTagsVisibility(tags, true);
            sv.focus.clear();
            refresh();
          },
          onDimOthers: () => sv.focus.setMode(sv.focus.mode() === "dim-others" ? "outline" : "dim-others"),
          onShowAll: () => {
            setTagsVisibility(tags, true);
            refresh();
          },
          onHideAll: () => {
            setTagsVisibility(tags, false);
            refresh();
          },
          onInvert: () => {
            invertTags(tags);
            refresh();
          },
        },
        signal,
      ),
    };
    const toggleExpanded = (path) => {
      if (tagTreeFilterQuery.trim()) return;
      if (expandedTagPaths.has(path)) expandedTagPaths.delete(path);
      else expandedTagPaths.add(path);
      tagTreeManualOverride = true;
      refresh();
    };

    // The group itself starts closed and its open state comes from the URL.
    // This only decides how much of the tree is pre-expanded once it is open,
    // so opening it never pushes the results off screen.
    applyTagTreeHeightDefault = () => {
      if (tagTreeManualOverride || !s.tagTreeExpanded) return;
      const rowsThatFit = countTagTreeRowsThatFit(panel);
      expandedTagPaths.clear();
      if (rowsThatFit < roots.length) return;
      let rows = roots.length;
      roots.forEach((root) => {
        const childRows = root.children.length;
        if (childRows === 0 || rows + childRows > rowsThatFit) return;
        expandedTagPaths.add(root.path);
        rows += childRows;
      });
    };

    const createNode = (node, depth) => {
      const hasChildren = node.children.length > 0;
      const element = ctx.doc.createElement("div");
      element.className = "tag-tree-node";
      const row = ctx.doc.createElement("div");
      row.className = hasChildren ? "tag-tree-row has-children" : "tag-tree-row";
      row.style.setProperty("--tag-tree-depth", `${depth}`);

      let caret;
      if (hasChildren) {
        caret = ctx.doc.createElement("button");
        caret.type = "button";
        caret.className = "tag-tree-caret";
        caret.setAttribute("aria-label", formatText(texts.tagTreeExpand, { path: node.path }));
        caret.addEventListener(
          "click",
          (event) => {
            event.stopPropagation();
            toggleExpanded(node.path);
          },
          { signal },
        );
      } else {
        caret = ctx.doc.createElement("span");
        caret.className = "tag-tree-caret-spacer";
      }
      row.appendChild(caret);

      let toggle = null;
      if (node.isTag) {
        const descendantTags = getDescendantTags(node);
        toggle = createTagToggle(node.path, getTreeNodeLabel(node), refresh, descendantTags, signal);
        toggle.classList.add("tag-tree-toggle");
        toggle.addEventListener("click", (event) => event.stopPropagation(), { signal });
        row.appendChild(toggle);
        row.appendChild(createFocusButton(node.path, signal));
      } else {
        const labelElement = ctx.doc.createElement("span");
        labelElement.className = "tag-tree-label";
        labelElement.textContent = getTreeNodeLabel(node);
        row.appendChild(labelElement);
      }

      // Was a "show all under X" button. Clicking a hidden parent now does
      // exactly that, so this is only a count, and parents keep one control.
      const meta = ctx.doc.createElement("span");
      meta.className = "tag-tree-meta";
      const metaHidden = ctx.doc.createElement("span");
      metaHidden.className = "tag-tree-meta-hidden";
      const metaCount = ctx.doc.createElement("span");
      metaCount.textContent = elementCount(node.isTag ? getTagElementCount(node.path) : 0);
      meta.append(metaHidden, metaCount);
      row.appendChild(meta);

      row.addEventListener(
        "click",
        () => {
          if (hasChildren) toggleExpanded(node.path);
          else if (toggle && !toggle.disabled) toggle.click();
        },
        { signal },
      );
      bindTagDescriptionTooltip(row, node, signal);
      element.appendChild(row);

      let childrenWrap = null;
      if (hasChildren) {
        childrenWrap = ctx.doc.createElement("div");
        childrenWrap.className = "tag-tree-children tag-tree-collapsible";
        const childrenInner = ctx.doc.createElement("div");
        childrenInner.className = "tag-tree-children-inner tag-tree-collapsible-inner";
        node.children.forEach((child) => childrenInner.appendChild(createNode(child, depth + 1)));
        childrenWrap.appendChild(childrenInner);
        element.appendChild(childrenWrap);
      }
      views.set(node.path, { element, row, caret, toggle, metaHidden, childrenWrap });
      return element;
    };
    roots.forEach((root) => tree.appendChild(createNode(root, 0)));

    filterInput.addEventListener(
      "input",
      () => {
        tagTreeFilterQuery = filterInput.value || "";
        refresh();
      },
      { signal },
    );
    filterInput.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape" || !filterInput.value) return;
        event.stopPropagation();
        filterInput.value = "";
        tagTreeFilterQuery = "";
        refresh();
      },
      { signal },
    );

    groupWrap.append(filterInput, panel);
    refresh();
  }

  function refreshTagTree(roots, views, emptyMessage, listView, tree) {
    const query = tagTreeFilterQuery.trim().toLowerCase();
    const matchMemo = new Map();
    const subtreeMatches = (node) => {
      if (!query) return true;
      if (!matchMemo.has(node.path)) {
        matchMemo.set(node.path, node.path.toLowerCase().includes(query) || node.children.some(subtreeMatches));
      }
      return matchMemo.get(node.path);
    };
    const countHiddenDescendants = (node) =>
      node.children.reduce((sum, child) => sum + (child.isTag && isTagHidden(child.path) ? 1 : 0) + countHiddenDescendants(child), 0);

    let visibleRowIndex = 0;
    const walk = (node, parentShown) => {
      const view = views.get(node.path);
      const matches = subtreeMatches(node);
      const shown = parentShown && matches;
      view.element.hidden = !matches;
      if (shown) {
        view.row.classList.toggle("is-striped", visibleRowIndex % 2 === 1);
        visibleRowIndex += 1;
      }
      let expanded = false;
      if (view.childrenWrap) {
        expanded = query ? node.children.some(subtreeMatches) : expandedTagPaths.has(node.path);
        view.element.classList.toggle("is-expanded", expanded);
        view.childrenWrap.classList.toggle("is-collapsed", !expanded);
        view.caret.setAttribute("aria-expanded", expanded ? "true" : "false");
        node.children.forEach((child) => walk(child, shown && expanded));
      }
      const hiddenBelow = view.childrenWrap && !expanded ? countHiddenDescendants(node) : 0;
      view.metaHidden.textContent = hiddenBelow > 0 ? formatText(texts.tagTreeHiddenBelow, { count: hiddenBelow }) : "";

      if (view.toggle) {
        // A child of a hidden parent shows as hidden, and cannot be clicked.
        const hiddenAncestor = getHiddenAncestor(node.path);
        view.toggle.classList.toggle("active", !isTagEffectivelyHidden(node.path));
        view.toggle.classList.toggle("ancestor-hidden", Boolean(hiddenAncestor));
        view.toggle.disabled = Boolean(hiddenAncestor);
        view.toggle.title = hiddenAncestor
          ? formatText(texts.tagHiddenBy, { ancestor: hiddenAncestor })
          : formatText(isTagHidden(node.path) ? texts.tagShowBranch : texts.tagHideBranch, { path: node.path });
      }
    };

    const listOpen = query.length > 0 || Boolean(s.tagTreeExpanded);
    tree.classList.toggle("is-filtering", query.length > 0);
    listView.header.classList.toggle("is-filtering", query.length > 0);
    listView.header.classList.toggle("is-expanded", listOpen);
    listView.header.setAttribute("aria-expanded", listOpen ? "true" : "false");
    listView.panel.classList.toggle("is-collapsed", !listOpen);
    const hiddenTotal = listView.tags.filter(isTagHidden).length;
    listView.meta.textContent =
      formatText(texts.tagTreeCount, { count: listView.tags.length }) +
      (hiddenTotal > 0 ? formatText(texts.tagTreeHiddenSuffix, { hidden: hiddenTotal }) : "");
    listView.reset.hidden = hiddenTotal === 0 && sv.focus.tags().length === 0;
    listView.bulk.hidden = !listOpen;
    renderFocusState();
    listView.showAllBtn.disabled = hiddenTotal === 0;
    listView.hideAllBtn.disabled = hiddenTotal === listView.tags.length;

    roots.forEach((root) => walk(root, listOpen));
    emptyMessage.hidden = !query || roots.some(subtreeMatches);
  }

  function initializeTagControls() {
    if (buildController) buildController.abort();
    buildController = new AbortController();
    const signal = AbortSignal.any([ctx.signal, buildController.signal]);
    controls.innerHTML = "";
    // The rows are gone, so their lazily created tooltips are orphans.
    tagTooltips.forEach((tooltip) => tooltip.remove());
    tagTooltips.clear();
    applyTagTreeHeightDefault = null;
    currentTagTreeRefresh = null;

    levelSlider = null;
    dimButtons.clear();
    if (s.maxDiagramLevel > 0) {
      levelSlider = createLevelSlider(ctx, signal);
      controls.appendChild(levelSlider.element);
    }

    const discovered = Array.from(s.diagramTagElements.keys()).sort((a, b) => a.localeCompare(b));
    if (discovered.length === 0) {
      const message = ctx.doc.createElement("div");
      message.className = "filter-result-item";
      message.innerHTML = `<small>${escapeHTML(s.maxDiagramLevel > 0 ? texts.noRegularTags : texts.noTags)}</small>`;
      controls.appendChild(message);
      return;
    }

    const groupsMap = new Map();
    discovered.forEach((tag) => {
      const groupId = model.getTagMenuGroup(tag);
      if (!groupsMap.has(groupId)) groupsMap.set(groupId, []);
      groupsMap.get(groupId).push(tag);
    });
    const orderedGroups = Array.from(groupsMap.keys()).sort((a, b) => {
      const groupA = model.getTagGroupMeta(a);
      const groupB = model.getTagGroupMeta(b);
      if ((groupA.order || 0) !== (groupB.order || 0)) return (groupA.order || 0) - (groupB.order || 0);
      return (groupA.label || groupA.id).localeCompare(groupB.label || groupB.id);
    });

    orderedGroups.forEach((groupId) => {
      const groupMeta = model.getTagGroupMeta(groupId);
      const groupWrap = ctx.doc.createElement("div");
      groupWrap.className = "tag-group";
      const groupTitle = ctx.doc.createElement("div");
      groupTitle.className = "tag-group-title";
      groupTitle.textContent = groupMeta.label || groupMeta.id;
      groupWrap.appendChild(groupTitle);

      const orderedTags = groupsMap.get(groupId).sort((a, b) => {
        const metaA = model.getTagMeta(a);
        const metaB = model.getTagMeta(b);
        if ((metaA.order || MAX_ORDER) !== (metaB.order || MAX_ORDER)) return (metaA.order || MAX_ORDER) - (metaB.order || MAX_ORDER);
        return (metaA.label || metaA.shortName).localeCompare(metaB.label || metaB.shortName);
      });
      if (groupMeta.layout === TAG_TREE_LAYOUT) renderTagTreeGroup(groupWrap, groupTitle, orderedTags, signal);
      else renderFlatTagGroup(groupWrap, orderedTags, signal);
      controls.appendChild(groupWrap);
    });
    renderFocusState();
  }

  // Re-runs the height rule against the panel as it is now. A no-op once the
  // reader has expanded or collapsed anything themselves.
  function refreshTagTreeDefaultState() {
    if (tagTreeManualOverride || typeof applyTagTreeHeightDefault !== "function") return;
    ctx.timers.requestAnimationFrame(() => {
      if (applyTagTreeHeightDefault) applyTagTreeHeightDefault();
      if (currentTagTreeRefresh) currentTagTreeRefresh();
    });
  }

  function onResize() {
    if (tagTreeManualOverride || typeof applyTagTreeHeightDefault !== "function") return;
    ctx.timers.clearTimeout(resizeTimeout);
    resizeTimeout = ctx.timers.setTimeout(() => {
      resizeTimeout = 0;
      if (applyTagTreeHeightDefault) applyTagTreeHeightDefault();
      if (currentTagTreeRefresh) currentTagTreeRefresh();
    }, TAG_TREE_RESIZE_DEBOUNCE_MS);
  }

  // After a setState: reflect visibility and level without rebuilding.
  function refresh() {
    controls.querySelectorAll(".tag-filter-btn").forEach((toggle) => updateTagToggleVisual(toggle.dataset.tag, toggle));
    if (levelSlider) levelSlider.render();
    if (currentTagTreeRefresh) currentTagTreeRefresh();
    renderFocusState();
  }

  return {
    initializeTagControls,
    refreshTagTreeDefaultState,
    clearTagTreeFilter: () => {
      tagTreeFilterQuery = "";
    },
    onResize,
    refresh,
  };
}

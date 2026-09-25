import { escapeHTML } from "./html";

export interface TagStyle {
  background?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: string;
  fontWeight?: string;
}

export interface TagPanelStyle {
  borderColor?: string;
  borderWidth?: string;
  boxShadow?: string;
}

export interface TagMetaInput {
  label?: string;
  group?: string;
  order?: number;
  style?: TagStyle | null;
  panelStyle?: TagPanelStyle | null;
  description?: string;
}

export interface TagMeta extends TagMetaInput {
  shortName: string;
  label: string;
  group: string;
  order: number;
  style: TagStyle | null;
  description: string;
}

export interface TagGroup {
  id: string;
  label?: string;
  order?: number;
  disableHelpIfHidden?: boolean;
  layout?: "tree" | "flat";
}

export interface TagRoles {
  // Each pattern is matched case-insensitively against the trimmed tag and
  // must have one capture group.
  level: string;
  cssClass: string;
  priority: string;
  severityFallback: readonly string[];
}

export interface TagsConfig {
  separator: string;
  roles: TagRoles;
  deriveAncestors: boolean;
  defaultGroup: string;
  groups: readonly TagGroup[];
  meta: Readonly<Record<string, TagMetaInput>>;
  descriptions: Readonly<Record<string, string>>;
}

export const DEFAULT_TAGS_CONFIG: TagsConfig = Object.freeze({
  separator: ".",
  roles: Object.freeze({
    level: "^level-(\\d+)$",
    cssClass: "^css-([a-z0-9-]+)$",
    priority: "^pri-(\\d+)$",
    severityFallback: Object.freeze(["info"]),
  }),
  deriveAncestors: false,
  defaultGroup: "general",
  groups: Object.freeze([]),
  meta: Object.freeze({}),
  descriptions: Object.freeze({}),
});

export type TagVisibility = ReadonlyMap<string, boolean>;

export type TagModel = ReturnType<typeof createTagModel>;

function compileRole(pattern: string, name: string): RegExp {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "i");
  } catch (error) {
    throw new Error(`tags.roles.${name}: invalid pattern ${JSON.stringify(pattern)}: ${(error as Error).message}`);
  }
  return regex;
}

const MAX_ORDER = Number.MAX_SAFE_INTEGER;
const DEFAULT_GROUP = Object.freeze({ label: "Tags", order: MAX_ORDER, layout: "tree" as const });
// Priority and severity-fallback tags without a configured group.
const PRIORITY_GROUP_ID = "priority";
const DEFAULT_PRIORITY_GROUP = Object.freeze({ id: PRIORITY_GROUP_ID, label: "Priority", order: 1, layout: "flat" as const });

export function createTagModel(config: TagsConfig) {
  const separator = config.separator;
  const levelRe = compileRole(config.roles.level, "level");
  const cssRe = compileRole(config.roles.cssClass, "cssClass");
  const priorityRe = compileRole(config.roles.priority, "priority");
  const severityFallback = config.roles.severityFallback.map((tag) => tag.toLowerCase());
  const descriptions = config.descriptions;
  const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

  function getTagParent(tag: string | null | undefined): string | null {
    const value = `${tag || ""}`;
    const index = value.lastIndexOf(separator);
    return index > 0 ? value.slice(0, index) : null;
  }

  function getTagLeafName(tag: string | null | undefined): string {
    const value = `${tag || ""}`;
    return value.slice(value.lastIndexOf(separator) + 1);
  }

  function isLevelTag(tag: string | null | undefined): boolean {
    return levelRe.test(`${tag || ""}`.trim());
  }

  function isCssTag(tag: string | null | undefined): boolean {
    return cssRe.test(`${tag || ""}`.trim());
  }

  function isPriorityTag(tag: string | null | undefined): boolean {
    return priorityRe.test(`${tag || ""}`.trim());
  }

  function isTopicTag(tag: string): boolean {
    return Boolean(tag) && !isLevelTag(tag) && !isCssTag(tag);
  }

  function withAncestors(tags: string[]): string[] {
    const out = [...tags];
    const seen = new Set(tags);
    tags.filter(isTopicTag).forEach((tag) => {
      let parent = getTagParent(tag);
      while (parent) {
        if (!seen.has(parent)) {
          seen.add(parent);
          out.push(parent);
        }
        parent = getTagParent(parent);
      }
    });
    return out;
  }

  function parseTags(tagValue: unknown): string[] {
    if (!tagValue || typeof tagValue !== "string") return [];
    const tags = tagValue
      .split(/[\s,]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    return config.deriveAncestors ? withAncestors(tags) : tags;
  }

  function parseLevelTag(tag: string | null | undefined): number | null {
    const match = `${tag || ""}`.trim().toLowerCase().match(levelRe);
    if (!match) return null;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getTagLevel(tags: readonly string[] | null | undefined): number {
    let level = 0;
    (tags || []).forEach((tag) => {
      const parsed = parseLevelTag(tag);
      if (parsed !== null && Number.isFinite(parsed)) {
        level = Math.max(level, parsed);
      }
    });
    return level;
  }

  function getNonLevelTags(tags: readonly string[] | null | undefined): string[] {
    return (tags || []).filter((tag) => tag && !isLevelTag(tag) && !isCssTag(tag));
  }

  function getCustomCssClassesForTags(tags: readonly string[] | null | undefined): string[] {
    const classes = new Set<string>();
    (tags || []).forEach((rawTag) => {
      const tag = `${rawTag || ""}`.trim().toLowerCase();
      if (!tag) return;
      const cssMatch = tag.match(cssRe);
      if (cssMatch) classes.add(`custom-${cssMatch[1]}`);
      if (priorityRe.test(tag)) classes.add(`custom-${tag}`);
    });
    return Array.from(classes);
  }

  function isDeclaredTag(tag: string): boolean {
    return has(descriptions, tag);
  }

  function getTagDescription(tag: string, { inherit = false }: { inherit?: boolean } = {}): string {
    const own = `${(has(descriptions, tag) && descriptions[tag]) || ""}`.trim();
    if (own || !inherit) return own;
    const parent = getTagParent(tag);
    return parent ? getTagDescription(parent, { inherit }) : "";
  }

  function getTagMeta(tag: string): TagMeta {
    return {
      label: tag,
      group: config.defaultGroup,
      order: MAX_ORDER,
      style: null,
      description: getTagDescription(tag, { inherit: true }),
      ...((has(config.meta, tag) && config.meta[tag]) || {}),
      shortName: tag,
    } as TagMeta;
  }

  // The menu group of a tag: its configured group, else priorities apart
  // from the rest. getTagMeta keeps the configured default group.
  function getTagMenuGroup(tag: string): string {
    const own = has(config.meta, tag) && config.meta[tag] ? config.meta[tag].group : undefined;
    if (own) return own;
    return isPriorityTag(tag) || severityFallback.includes(tag.toLowerCase()) ? PRIORITY_GROUP_ID : config.defaultGroup;
  }

  // Unconfigured groups (a diagram without a definition, like the standalone
  // app): the default group is the "Tags" tree, priorities a flat group.
  function getTagGroupMeta(groupId: string): TagGroup & { label: string; order: number } {
    const group = config.groups.find((candidate) => candidate.id === groupId);
    if (group) return group as TagGroup & { label: string; order: number };
    if (groupId === config.defaultGroup) return { ...DEFAULT_GROUP, id: groupId };
    if (groupId === PRIORITY_GROUP_ID) return DEFAULT_PRIORITY_GROUP;
    return { id: groupId, label: groupId, order: MAX_ORDER };
  }

  // Group order, then tag order, then label. `|| 0` / `|| MAX` are deliberate,
  // where an order of 0 counts as unset.
  function compareTagsByFilterOrder(a: string, b: string): number {
    const metaA = getTagMeta(a);
    const metaB = getTagMeta(b);
    const groupA = getTagGroupMeta(metaA.group || config.defaultGroup);
    const groupB = getTagGroupMeta(metaB.group || config.defaultGroup);

    if ((groupA.order || 0) !== (groupB.order || 0)) {
      return (groupA.order || 0) - (groupB.order || 0);
    }
    if ((metaA.order || MAX_ORDER) !== (metaB.order || MAX_ORDER)) {
      return (metaA.order || MAX_ORDER) - (metaB.order || MAX_ORDER);
    }
    return (metaA.label || metaA.shortName).localeCompare(metaB.label || metaB.shortName);
  }

  function getSortedVisibleTags(tags: readonly string[] | null | undefined): string[] {
    return [...new Set(getNonLevelTags(tags))].sort(compareTagsByFilterOrder);
  }

  function getBadgeStyle(style: TagStyle | null | undefined): string {
    if (!style) return "";
    let inline = "";
    if (style.background) inline += `background:${style.background};`;
    if (style.color) inline += `color:${style.color};`;
    if (style.borderColor) inline += `border-color:${style.borderColor};`;
    if (style.borderWidth) inline += `border-width:${style.borderWidth};`;
    if (style.fontWeight) inline += `font-weight:${style.fontWeight};`;
    return inline;
  }

  function buildTagBadgesHtml(tags: readonly string[] | null | undefined, label: (tag: string, meta: TagMeta) => string = (tag, meta) => meta.label || tag): string {
    const sortedTags = getSortedVisibleTags(tags);
    if (!sortedTags.length) return "";
    const badges = sortedTags
      .map((tag) => {
        const meta = getTagMeta(tag);
        return `<span class="annotation-tag-badge" style="${getBadgeStyle(meta.style)}">${escapeHTML(label(tag, meta))}</span>`;
      })
      .join("");
    return `<div class="annotation-tag-badges">${badges}</div>`;
  }

  // Lowest priority number wins; otherwise the first fallback tag present.
  function getPrimarySeverityTag(tags: readonly string[] | null | undefined): string | null {
    const normalized = (tags || []).map((tag) => `${tag || ""}`.trim().toLowerCase());
    let best: { tag: string; rank: number } | null = null;
    normalized.forEach((tag) => {
      const match = tag.match(priorityRe);
      if (!match) return;
      const rank = Number.parseInt(match[1], 10);
      if (!Number.isFinite(rank)) return;
      if (!best || rank < best.rank) best = { tag: tag.replace(match[1], `${rank}`), rank };
    });
    if (best) return (best as { tag: string }).tag;
    return severityFallback.find((tag) => normalized.includes(tag)) || null;
  }

  function getSeverityClassForTags(tags: readonly string[] | null | undefined): string {
    const severityTag = getPrimarySeverityTag(tags);
    return severityTag ? `severity-${severityTag}` : "severity-default";
  }

  function getSeverityPanelStyle(tags: readonly string[] | null | undefined): TagPanelStyle | null {
    const severityTag = getPrimarySeverityTag(tags);
    if (!severityTag) return null;
    return getTagMeta(severityTag).panelStyle || null;
  }

  function hasPriorityTag(tags: readonly string[] | null | undefined): boolean {
    return (tags || []).some(isPriorityTag);
  }

  function isTagSetVisible(tags: readonly string[] | null | undefined, visibility: TagVisibility): boolean {
    return getNonLevelTags(tags).every((tag) => visibility.get(tag) !== false);
  }

  function isTagSetWithinSelectedLevel(tags: readonly string[] | null | undefined, selectedLevel: unknown): boolean {
    const level = Math.max(0, Number.parseInt(`${selectedLevel}`, 10) || 0);
    return getTagLevel(tags) <= level;
  }

  function getHiddenDisableTags(tags: readonly string[] | null | undefined, visibility: TagVisibility): string[] {
    return getNonLevelTags(tags).filter((tag) => {
      const meta = getTagMeta(tag);
      const group = getTagGroupMeta(meta.group || config.defaultGroup);
      return group.disableHelpIfHidden === true && visibility.get(tag) === false;
    });
  }

  function isTagSetDisabledByHiddenGroup(tags: readonly string[] | null | undefined, visibility: TagVisibility): boolean {
    return getHiddenDisableTags(tags, visibility).length > 0;
  }

  // Tags hidden in their own right, minus those already covered by a hidden
  // ancestor, in filter order. This is what filter-hide-tags carries.
  function getHiddenAncestor(tag: string, visibility: TagVisibility): string | null {
    let parent = getTagParent(tag);
    while (parent) {
      if (visibility.get(parent) === false) return parent;
      parent = getTagParent(parent);
    }
    return null;
  }

  function getExplicitHiddenTags(entries: Iterable<[string, boolean]>): string[] {
    const hidden = new Set(Array.from(entries).filter(([, visible]) => visible === false).map(([tag]) => tag));
    const hasHiddenAncestor = (tag: string) => {
      let parent = getTagParent(tag);
      while (parent) {
        if (hidden.has(parent)) return true;
        parent = getTagParent(parent);
      }
      return false;
    };
    return Array.from(hidden)
      .filter((tag) => !hasHiddenAncestor(tag))
      .sort(compareTagsByFilterOrder);
  }

  // Every topic tag except the listed ones, their ancestors and descendants.
  function hiddenTagsForOnly(onlyTags: readonly string[], allTags: readonly string[]): string[] {
    const keep = new Set<string>();
    onlyTags.forEach((tag) => {
      keep.add(tag);
      let parent = getTagParent(tag);
      while (parent) {
        keep.add(parent);
        parent = getTagParent(parent);
      }
    });
    const isKept = (tag: string) =>
      keep.has(tag) || onlyTags.some((only) => tag.startsWith(`${only}${separator}`));
    return allTags.filter((tag) => isTopicTag(tag) && !isKept(tag));
  }

  return {
    config,
    parseTags,
    getTagParent,
    getTagLeafName,
    isLevelTag,
    isCssTag,
    isPriorityTag,
    isTopicTag,
    parseLevelTag,
    getTagLevel,
    getNonLevelTags,
    getCustomCssClassesForTags,
    isDeclaredTag,
    getTagDescription,
    getTagMeta,
    getTagGroupMeta,
    getTagMenuGroup,
    compareTagsByFilterOrder,
    getSortedVisibleTags,
    buildTagBadgesHtml,
    getPrimarySeverityTag,
    getSeverityClassForTags,
    getSeverityPanelStyle,
    hasPriorityTag,
    isTagSetVisible,
    isTagSetWithinSelectedLevel,
    getHiddenDisableTags,
    isTagSetDisabledByHiddenGroup,
    getHiddenAncestor,
    getExplicitHiddenTags,
    hiddenTagsForOnly,
  };
}

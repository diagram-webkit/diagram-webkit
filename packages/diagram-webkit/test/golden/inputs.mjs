// Inputs the golden outputs (golden/*.json) were captured from with the
// original implementation. The core unit tests replay them.

export const TAG_SAMPLES = [
  "",
  "level-1 Api Api.Rbac",
  "Api,Api.Rbac, level-2",
  "  info   pri-2 Network ",
  "LEVEL-3 css-brighter CSS-Dim-Blue pri-1 Pri-3 info",
  "pri-10 pri-2",
  "Network Network.Egress Network.Egress.Gateway level-2",
  "Access.Cli Access",
  "legend",
  "info",
  "css-bad_name level-x level-",
  "Ingress.GatewayApi Ingress Ingress.GatewayApi.Route pri-3",
];

export const TAG_NAMES = [
  "Api",
  "Api.Rbac",
  "Network.Egress.Gateway",
  "level-1",
  "LEVEL-2",
  "css-brighter",
  "css-Bad",
  "info",
  "pri-1",
  "pri-10",
  "Unknown.Tag",
  "Ingress.GatewayApi.Policy",
  "a.",
  ".a",
  "",
];

export const SORT_LISTS = [
  ["Network", "Api", "pri-2", "info", "pri-1", "Access.Cli", "Access", "legend", "Zeta"],
  ["Ingress.GatewayApi", "Ingress", "CertManager", "pri-3", "Traditional", "Cnapp"],
];

export const VISIBILITY_CASES = [
  { hidden: [], level: 3 },
  { hidden: ["Api"], level: 3 },
  { hidden: ["Api.Rbac", "info"], level: 1 },
  { hidden: ["pri-1", "Network.Egress"], level: 0 },
  { hidden: ["Access", "legend"], level: 2 },
];

export const HELP_SAMPLES = [
  null,
  "",
  "   \n  \n",
  "Title only",
  "Title\nBody line",
  "\n\n  Title with space  \n    indented\n      more\n    back\n",
  "Title\r\nWindows\r\nlines",
  "Title\rOld mac",
  "What is <b>this</b>\n  <a href=\"https://x\">link</a> & more\n\n  para",
  "T\n\tTabbed\n\t\tdeeper",
];

export const QUERY_SAMPLES = ["", "  ", " Api ", "RBAC", "a b"];

export const SUMMARY_SAMPLES = [
  [5, 5, ""],
  [1, 5, ""],
  [0, 5, "x"],
  [1, 5, "rbac"],
  [2, 5, "net"],
  [0, 0, ""],
];

export const ESCAPE_SAMPLES = [
  "",
  "plain",
  "<b>x</b> & y > z",
  "\"quoted\" 'single'",
  "line1\nline2",
  "cr\rlf\r\nend",
  "nb sp",
  "tab\tx",
  null,
  undefined,
  42,
];

export const MULTILINE_SAMPLES = [
  "",
  null,
  "one",
  "\n  a\n  b\n",
  "   a\n     b\n   c   ",
  "\n\n  x\n\n  y\n",
  "a\n  b",
];

export const SANITIZE_SAMPLES = [
  "",
  "plain text",
  "<b>bold</b> <i>it</i> <u>u</u>",
  "<script>alert(1)</script>ok",
  "<a href=\"javascript:alert(1)\">x</a>",
  "<b onclick=\"x()\">b</b>",
  "a<br>b<hr>c",
  "<div><strong>nested <em>deep</em></strong></div>",
  "<p>para</p>",
  "<b>unclosed",
  "&lt;tag&gt; &amp; entities",
  "<BR><B>UPPER</B>",
];

export const DESCRIPTION_SAMPLES = ["", "line\nnext", "<b>x</b>\n<script>y</script>", "a & b\n\nc"];

export const FILTER_URL_SAMPLES = [
  "",
  "?menu=true",
  "?menu=false&filter-query=%20rbac%20",
  "?filter-hide-tags=Api,Network.Egress,,%20Access%20",
  "?filter-hide-tags=",
  "?pins=WebApp,,DbAccess&constraint=pinned",
  "?constraint=pinned,other",
  "?filter-level=2",
  "?filter-level=-3",
  "?filter-level=abc",
  "?filter-level=",
  "?tags=open",
  "?tags=closed",
  "?menu=true&filter-query=a%2Cb&filter-hide-tags=A&pins=B&constraint=pinned&filter-level=1&tags=open",
];

function b64(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export const ANNOTATION_URL_SAMPLES = [
  "",
  "?annotations=",
  "?annotations=notbase64!!",
  `?annotations=${encodeURIComponent(b64({ x: 1 }))}`,
  `?annotations=${encodeURIComponent(
    b64([
      { x: 0.5, y: 0.5, type: "user-info", title: "Hi", description: "d" },
      { x: 0.1, y: 0.2, type: "area-info", shape: "circle", widthRel: 0.1, heightRel: 0.2 },
      { x: 0.1, y: 0.2, type: "arrow-info", x2: 0.3, y2: 0.4, title: "" },
      { x: 1.5, y: 0.5, type: "user-info" },
      { x: 0.5, y: 0.5, type: 3 },
      { x: 0.5, y: 0.5, type: "user-info", title: "x".repeat(51) },
      { x: 0.5, y: 0.5, type: "user-info", title: "Ünïcødé ✓", description: "y".repeat(600) },
      { x: 0.5, y: 0.5, type: "user-info", shape: "hexagon", widthRel: -1, heightRel: 0 },
      { x: 0.5, y: 0.5, type: "arrow-info", x2: 2, y2: 0.4 },
      null,
      "str",
    ]),
  )}`,
  `?annotations=${encodeURIComponent(
    b64(Array.from({ length: 12 }, (_, index) => ({ x: index / 12, y: 0.5, type: "user-info", title: `${index}` }))),
  )}`,
];

export const VIEWPORT_URL_SAMPLES = [
  "",
  "?v=fit",
  "?v=FIT",
  "?v=0",
  "?v=%20fit%20",
  "?v=0.5,0.5,0.25,0.25",
  "?v=0.123456,0.5,0.99999,1",
  "?v=0.5,0.5,0,0.5",
  "?v=0.5,0.5,1.1,0.5",
  "?v=-0.1,0.5,0.5,0.5",
  "?v=0.5,0.5,0.5",
  "?v=a,b,c,d",
  "?v=0.5,0.5,0.5,0.5,0.5",
  "?v=1,0,1,1",
  "?v=0.33333333,0.66666666,0.1,0.2",
];

export const URL_WRITE_SCENARIOS = [
  { name: "empty", search: "", state: {} },
  { name: "strip-all-filters", search: "?menu=true&filter-query=x&tags=open&pins=A&other=1", state: {} },
  { name: "menu-only", search: "", state: { visible: true } },
  { name: "query", search: "?other=1", state: { query: "  rbac, api  " } },
  {
    name: "hidden-tags-ancestor-filter",
    search: "",
    state: { hidden: ["Network.Egress", "Network", "Api.Rbac", "pri-1", "Zeta", "Network.Egress.Gateway"] },
  },
  { name: "pins-sorted", search: "", state: { pins: ["WebApp", "Cache", "DbAccess"] } },
  { name: "constraint", search: "", state: { pins: ["A"], constraints: ["pinned"] } },
  { name: "level-default", search: "?filter-level=1", state: { level: 3, defaultLevel: 3 } },
  { name: "level-nondefault", search: "", state: { level: 1, defaultLevel: 3 } },
  { name: "tags-open", search: "", state: { tagsExpanded: true } },
  { name: "viewport", search: "?menu=true", state: { viewport: "0.5,0.5,0.25,0.25", visible: true } },
  { name: "viewport-fit", search: "", state: { viewport: "fit" } },
  { name: "viewport-remove", search: "?v=0.1,0.1,0.1,0.1", state: { viewport: null } },
  {
    name: "annotations",
    search: "",
    state: {
      annotations: [
        { x: 0.5, y: 0.25, type: "user-info", title: "Hi ✓", description: "a\nb", shape: "rectangle", _el: "dom", _index: 0 },
      ],
    },
  },
  { name: "annotations-remove", search: "?annotations=abc", state: { annotations: [] } },
  {
    name: "order-preserved",
    search: "?pins=Z&v=fit&x=1&menu=true&annotations=abc",
    state: { pins: ["Z"], visible: true, viewport: "fit", annotations: [{ x: 0, y: 0, type: "t", title: "" }] },
  },
  { name: "hash", search: "?a=1#frag", state: { visible: true } },
];

# diagram-webkit user guide

diagram-webkit turns a draw.io diagram into something you can explore: zoom and pan, read the help text built into the diagram, search it, filter it by topic and level of detail, pin the parts you care about, draw your own notes on it, and share exactly what you are looking at as a link.

This guide covers:

1. [Your privacy](#your-privacy)
2. [Opening a diagram](#opening-a-diagram)
3. [Finding your way around](#finding-your-way-around)
4. [Sharing](#sharing)
5. [Making your own diagram in draw.io](#making-your-own-diagram-in-drawio)
6. [How it works](#how-it-works)
7. [Troubleshooting](#troubleshooting)
8. [For developers](#for-developers)

## Your privacy

Everything happens in your browser.

- The diagram you open is **never uploaded or sent to a server**. There is no account, no tracking and no storage anywhere but your own browser.
- A link that contains the diagram carries it after the `#` in the address. Browsers never send that part to a server, not even the one hosting the page.
- The page makes no network requests on its own. The only exception is when you ask it to open a diagram from a link: then it fetches that one file, without cookies and without telling the other site where you came from.
- Diagrams you open are cleaned before they are shown: anything that could run code or load something from the internet is removed. More in [How it works](#how-it-works).

The app is a single HTML file, so you can also save it and use it without any network at all.

## Opening a diagram

When no diagram is loaded, the page asks for one. There are four ways:

| How | What to do |
| --- | --- |
| Choose a file | Click **Choose SVG file…** and pick an `.svg` saved from draw.io. |
| Drag and drop | Drop an `.svg` file anywhere on the page. |
| From a link | Paste the address of an SVG into the link field and press **Load**. |
| From a shared link | Open a link someone sent you. It either contains the diagram, or points to it. |

Once a diagram is open, the **?** at the bottom left has an **Open diagram** tab for another one; dropping a new file on the page works too. The page starts fresh with the new diagram.

Loading from a link only works when the site hosting the SVG allows it to be read from other sites (CORS). GitHub raw files and most public file hosts do. If it does not work, download the file and open it instead.

## Finding your way around

### Moving

| Do | Mouse / touch | Keyboard |
| --- | --- | --- |
| Zoom | scroll wheel, or pinch | `+` / `-` |
| Pan | drag | arrow keys (hold `Shift` for bigger steps) |
| See everything | | `0` |
| Help, links and controls | the **?** at the bottom left | `?` |
| Close whatever is open | | `Esc` |
| Select a topic in the open tooltip ([tag picker mode](#tag-picker-mode)) | | `1`–`9`, then `a`–`z` |
| Undo / redo in [tag picker mode](#tag-picker-mode) | | `Ctrl`/`⌘` + `Z` / + `Shift` + `Z` |

### Help text

Parts of the diagram can carry a short explanation. Hover over them (or tap on a touch screen) to read it. In many diagrams these parts are marked with a small **?**, but anything can have help text.

A part with a coloured dot in its corner also has examples: a config snippet, a shell command, a log line. They are tabs next to **Help** in its tooltip and its menu entry; clicking one keeps the tooltip open until you click somewhere else. **Copy** puts the example on the clipboard. Search looks through the examples too, and when only an example matches, its tab is shown.

### The menu

The menu button (bottom right) opens a panel with everything for narrowing down what you see:

- **Search** (`/` jumps to it) looks through all help text. Parts with matching help stay, the other parts with help are hidden. Click or tap a result to see where it is in the diagram.
- **Level** controls the amount of detail. Level 0 is the overview; each step up adds more. "max" shows everything.
- **Tags** are the topics of the diagram, as a tree. Click a topic to hide it and everything under it in the tree. **Show all**, **Hide all** and **Invert** work on the whole tree, and the filter field finds a tag by name. **Reset** (shown once something is hidden or in focus) brings back every tag and ends the focus.
- Tooltips and results show a topic only while its row is visible in the tree; a closed tree counts as showing its top level. That keeps them short. **Expand all** opens every branch, and with it every topic; **Collapse all** closes the branches again. Both are part of the link (`tags=all`).
- Hover a tag in the tree for **focus**: it zooms to that topic and highlights it, and stays lit while on. Focus on several at once. **Dim others** (in yellow, after Show all / Hide all / Invert) fades out everything else while something is in focus. Hiding a topic ends its focus.
- A priority button gets a small **</>** half when some of its markers have examples. Turn it on to show only those markers (pinned ones stay), also when the priority was hidden. Hiding the priority with its button turns it off.
- A diagram opened without its own settings gets the same menu: priorities (`pri-1`, `info`) in their own group, and the other tags as the tree.
- **Pinned** lists what you pinned (see below). **Clear** unpins everything; **Hide** folds the list.

Anything hidden explains itself when you look for it: a search result that is filtered out says which tag or level hides it.

### Pins

Pin a part with the pin button in its help text. Pinned parts are marked in the diagram and listed in the menu, so you can come back to them, show only them, or send them to someone. Pins are part of the link.

### Your own notes (annotations)

Under **User Annotations** in the menu you can add your own points, areas and arrows, each with a title and a description. Turn on **Edit Mode** to move and resize them. They are part of the link, so whoever opens it sees your notes too.

Descriptions can use a little formatting (bold, italics, line breaks); everything else is shown as plain text.

### Tag picker mode

For working out which topics a view (a slide, say) should show. Turn it on under **?** > **Settings** (or add `?tag-picker-mode` to the address). It needs a mouse or trackpad; on touch screens the setting is off and greyed out.

- Hover a part: its tooltip gets a line of its topics, with keys: `Network [1]`, `Network.Ingress [2]`; after `[9]` they go on with `[a]` to `[z]`. Click one, or press its key, to select it. Not `Ctrl` + number: Chrome on Windows and Linux uses that to switch tabs. So the digits reach the picker, the search and tag filter fields give up the keyboard in this mode: opening the menu does not put the cursor in search, and a tooltip opening takes it out. Parts without help text get a tooltip with only that line. Hovering another part replaces the tooltip at once; moving onto the tooltip keeps it open.
- In the menu's tag tree, **select** on a row does the same, also for hidden topics.
- Selected parts glow magenta, the focus glows yellow. Selecting alone changes nothing else: nothing zooms, dims or hides.
- A bar above the tags in the menu. The way of working: select topics, choose what they do (the buttons below), clear the selection, select the next ones.
- Its top row: **↶ Undo** / **↷ Redo** (also `Ctrl`/`⌘` + `Z` and `Ctrl`/`⌘` + `Shift` + `Z`), and **Clear selection** on the right. Undo steps back through every change made while the mode is on: the selection, hidden topics, focus and level, also changes made in the tag tree or with the level slider (one drag is one step). The history is not in the address, so a reload or **Apply** starts it over.
- Below that, the selection (click a topic to deselect it) and what to do with it:

| Button | Does |
| --- | --- |
| Focus selected / Unfocus selected | puts them in focus, or (when all are) takes them out; the view does not move |
| Show selected | shows them, with their parents and children; everything else stays |
| Hide selected | hides them (and everything under them) |
| Hide others | shows only them, with their parents and children; hides every other topic |
| Make final | opens a summary first (below) |

**Make final** shows what the result will be: how many topics and parts are shown, what is hidden and in focus, the level, a search or pins. It checks for loose ends: selected topics that are neither in focus nor hidden (the selection alone does nothing in the final view), selected topics that are hidden, and a view that shows everything. **Copy backup link** copies the address as it is, with the selection, to come back to it; **Copy final link** copies the address after Apply. **Apply** turns the mode off and takes it out of the address; the focus and hidden topics stay. It cannot be undone, except with the backup link: the undo history ends with the mode.

The selection stays after each action, so you can go back and forth. [Internal topics](#tags-internal-topics) (`_.…`) appear in the tree and the tooltips only in this mode. Only topics in the tag tree are picked: the level slider and priorities (`pri-1`, `info`) work as always. The selection is in the address (`?tag-picker-mode=Network,Data`), so a reload keeps it; slides and "Copy as slide" never carry it.

**Settings** also has **Open in debug** (or **Leave debug**): it reloads the page with `?debug`, which loads the diagram's debug source if it has one, reports missing and duplicate slugs in the browser console, and shows **Copy as slide** on the Share tab.

### Dark theme

The theme button at the top of the menu switches between light and dark. Your choice is remembered in this browser. The diagram's own colours are turned dark (light boxes become dark, dark text light, hues kept); highlights, pins and the tag picker glow keep their colours.

## Sharing

The address in your browser always describes what you see: the position, the level, the hidden tags, the search, pins, annotations and, for a diagram you opened yourself, the diagram itself. Copy it, and the person you send it to sees the same thing.

The **?** at the bottom left opens a dialog with tabs: **Open diagram**, **About**, **Share** (ready-made links to copy, and the diagram file), **URL parameters** (what each part of the address means, grouped by what it does), **Controls** (mouse, touch and keys) and **Settings** ([tag picker mode](#tag-picker-mode) and debug). The `?` key opens it on Controls, the left and right arrow keys switch tabs, and the bottom of the dialog shows the version.

The **Share** tab has these links, each with a copy button:

- **Current**: exactly what you see.
- Variants without your annotations, without the position, or without anything but the diagram.

A line under the links tells you whether the diagram travels inside them, and warns you when that makes them long:

| Link length | What it means |
| --- | --- |
| up to 32 000 characters | Fine everywhere. |
| over 32 000 | Some chat tools and mail clients cut links this long. |
| over 100 000 | Many tools will cut or reject it; sending the SVG file may work better. |
| over 2 MiB | Too large for a link: the links open without the diagram. Send the file instead. |

The diagram is compressed first, so most diagrams fit easily. Embedded images make a diagram much larger.

If you opened the diagram from a link, the links point to that same file instead: they stay short, and whoever opens them loads the diagram from there. The diagram itself is not put into them.

**Download SVG**, on the same line, gives you the diagram as a file again, for example when someone sent you a link with the diagram inside. It is the cleaned version (see [How it works](#how-it-works)); if the original was saved as SVG from draw.io, it still opens in draw.io.

## Making your own diagram in draw.io

Any draw.io SVG can be opened. It becomes much more useful when you add three things to the parts of your diagram:

| Property | What it does | Example |
| --- | --- | --- |
| `tags` | topics and level, for filtering | `level-1 Network Network.Ingress` |
| `help` | the explanation shown on hover and found by search | `Load balancer` + a description on the next lines |
| `slug` | a short, stable name, so the part can be pinned and linked to | `LoadBalancer` |
| `help.<formatter>.<name>` | an example shown as a tab next to the help ([Help text](#help-text-1)) | `help.yaml.falco_rule` |

More, for lines, draw on top of them ([Lines: overlays](#lines-overlays), [Lines: an arrow at each box](#lines-an-arrow-at-each-box)):

| Property | What it does | Example |
| --- | --- | --- |
| `overlay-definition` | this line's look defines an overlay | `egress` |
| `overlay-tags` | on the `overlay-definition` line: tags every band of that overlay carries | `_ _.Traffic _.Traffic.Egress` |
| `overlay` | draw these overlays along this line | `egress` or `egress,ingress` |
| `arrow-at-each-box` | on a line: repeat its arrowhead at every box it passes under. On a box: always (`true`) or never (`false`) an arrow here | `true` |
| `overlay-destination` | on a box: bands end or start here, never pass through | `true` |

### Adding properties

1. Select a shape, a line or a text in draw.io.
2. Open **Edit Data**: right-click → *Edit Data…*, or `Ctrl+M` (`Cmd+M` on a Mac).
3. Add a property, for example `tags`, and give it a value. Repeat for `help` and `slug`.
4. Click **Apply**.

### Tags: topics

Tags are separated by spaces. A topic can have sub-topics, written with dots, and the dots build the tree in the menu:

```
Network
Network.Ingress
Network.Egress
Data
Data.Cache
```

Some rules that save trouble later:

- **Write the parents too.** A shape tagged `Network.Ingress` should also have `Network`: `Network Network.Ingress`. Then hiding `Network` hides the whole branch.
- **A part is hidden when any of its topics is hidden.** A shape tagged `Data Network` disappears when either one is hidden.
- **Lines** should carry the topics of both shapes they connect, so a line never floats alone with one end hidden.
- **Things inside a box** (a container, a group) should carry the box's topics too.
- Keep names short and consistent. `PascalCase` without spaces works well (`Network.PodToPod`). Up to three levels deep (`A.B.C`).
- Shapes without topics are always visible (unless their level hides them): use that for the frame of the diagram.

### Tags: internal topics

Topics under `_` (`_.Frame.Pod`, `_.Group.Actors`) are for building views, such as slides, without cluttering the menu. Use them for frames, or groupings that would be noise as a regular topic.

- They show only in [tag picker mode](#tag-picker-mode): in the tag tree and in the tooltip's topic line. Never as badges in tooltips or the result list.
- They hide like any topic: in tag picker mode, in a view's `hiddenTags`, or with `filter-hide-tags=_.Frame.Pod`.
- `onlyTags` (`only-tags=`) and **Hide others** leave them as they are, so adding one to a shape never changes an existing view.
- They are not passed on to the shapes inside a frame or to its lines: hiding `_.Frame.Pod` hides only the frame. Write the parents too (`_ _.Frame _.Frame.Pod`).

### Tags: levels of detail

`level-1`, `level-2`, … say how much detail a part is. A part is shown when its level is at or below the level selected in the menu.

```
(no level tag)   always shown: the big picture
level-1          one step deeper
level-2          details
```

Give a part inside a box at least the level of the box, and a line at least the level of its ends.

### Tags: special ones

| Tag | Effect |
| --- | --- |
| `level-N` | level of detail (above) |
| `pri-1`, `pri-2`, … `info` | a priority or kind. Shown as its own tags; a site built on diagram-webkit can give them colours and labels. |
| `css-<name>` | adds the CSS class `custom-<name>` to the part, for sites that bring their own styles |

### Lines: overlays

An overlay is a wide, translucent band drawn along lines, for example to show the way traffic comes in (ingress, red) and goes out (egress, blue). You draw the look once; diagram-webkit draws the bands along the lines, all the way to the arrow tips and joined through the boxes in between.

**1. Define the look** with one line, usually in the legend. Draw it exactly as the band should look (colour, width, dashes, opacity; for example width 12 at 20 % opacity) and give it the property:

```
overlay-definition   egress
```

**2. Mark the lines** the band should follow:

```
overlay   egress
```

Two or more bands on one line: `egress,ingress` (commas or spaces).

**3. Save** as SVG. The legend line stays as drawn; every marked line gets a band.

How the bands are drawn:

- **Look.** Everything is copied from the definition line: colour, dark-theme colour, width, dashes. Change the legend line, and every band follows, so the legend always matches.
- **Ends.** A band runs to the tip of the line's arrow, so it reaches the box the arrow points at.
- **Direction.** Arrows give the direction of the flow: a line with an arrow at one end flows towards it. A line with arrows at both ends, or none, takes its direction from the lines it meets: first it continues a line that arrives at the same box, then any line it touches. This is worked out per overlay, so one line with arrows at both ends can carry two flows the opposite way: ingress in towards a box, egress out of it.
- **Joins.** Where one marked line arrives at a box and another leaves it, their bands are joined inside the box: one corner when the lines are at right angles, a straight crossing or a U-turn through the box's centre line when they are parallel. Line ends at the same point (within 4 px) are joined too. Two lines that both arrive at a box, or both leave it, are not joined: that is not a flow through the box. Only bands of the same overlay are joined.
- **Branches.** A line arriving at a box with several lines leaving it is joined to each of them, so a flow can fork (git → image-builder → registry, internet, scanner).
- **Several overlays** on one line lie side by side, together centred on the line: two bands touch at the line, three have the middle one on the line. The order is the order in `overlay`: the first on the left, looking the way the line's arrow points. For a line with arrows at both ends, or none, that is looking from where the line starts in draw.io to where it ends; if the sides come out the wrong way round, swap the order. `egress,ingress` and `ingress,egress` put the same bands on opposite sides.
- **Together and apart.** Bands that go the same way through a box stay side by side and turn concentrically: the outer one wider, the inner one tighter, no gap. Bands that share a line and then part (ingress on to one line, egress to another) run side by side up to the box's centre line and turn off there, each straight to its own line.
- **Destinations.** A box with `overlay-destination = true` is where a flow ends or starts: bands go to it and from it, but no band is joined through it, and flows do not take their direction from each other there. Use it for a box several flows point at (a process, a service) that is not a way through.
- **On top.** Bands are drawn over the whole diagram, boxes included, so a flow reads as one band through the boxes it passes. Only the parts with a `slug` (the markers that carry help: circles, `?`) stay above them: they are lifted above the bands, keeping their place and their order among themselves, so a marker can then also lie above a box that came after it in draw.io.
- **Visibility.** A band is shown, hidden, faded and dimmed with its line. A join shows only while both of its lines do.
- **Tags of their own.** With `overlay-tags` on the definition line, all bands of that overlay are also filtered by those tags, like a part: hiding the tag hides every band of the overlay, also on lines that carry another overlay, which stays; focusing it keeps the bands sharp under "dim others". Example: `overlay-tags = _ _.Traffic _.Traffic.Ingress` on the ingress line, then `filter-hide-tags=_.Traffic.Ingress` shows only egress.
- **Boxes** are draw.io shapes (not their labels). A line end counts as arriving at the smallest shape whose border it touches.

Keep in mind:

- Only lines can have overlays; on a shape the property is ignored with a warning in the browser console.
- Remove old hand-drawn bands from the diagram; they are not replaced automatically.
- If two joined lines carry a different number of overlays (`egress` against `egress,ingress`), the band makes a small sideways step at the join. Give lines of one flow the same overlays.
- Curved lines are followed; line jumps (draw.io's arcs where lines cross) are drawn straight.

### Lines: an arrow at each box

One line through a row of boxes, drawn under them, reads `---box1---box2---box3--->box4`: only the end has an arrow. With `arrow-at-each-box = true` on the line, it reads `--->box1--->box2--->box3--->box4`, and stays one line:

```
line   tags: Api   arrow-at-each-box: true      (drawn under box1..box3, arrow at the end)
```

- The arrowhead is a copy of the line's own end arrow (shape, size, colour), turned along the line, with its tip on the box's edge. Rectangles and ellipses are exact; other shapes use their bounding rectangle.
- Each arrow shows while its box and the line show. Hide `box2` (its tags, its level) and its arrow goes: the line runs on to `box3` as if `box2` were never there. That is the point: no extra short lines per box, whatever the boxes' tags.
- Which boxes: the ones the line passes **under**, that is drawn after it (on top of it in draw.io: Arrange → To Front, or simply added later) and filled. Not: the boxes the line starts and ends at (they have its own arrowheads), boxes without a fill (the line shows through), containers the line lies in (drawn before it), and markers: shapes with a priority or info tag (`pri-1`, `info`), such as the coloured circles and `?` boxes placed on lines.
- `arrow-at-each-box` on a box overrides that: `true` gives it an arrow even as a marker or without a fill, `false` never.
- A line without an arrowhead has nothing to repeat (a warning in the browser console). With an arrow only at the start, the line counts as running the other way.
- Drawn in by `diagram-webkit render` too ([below](#overlays-in-the-svg-file-itself)); `validate` reports a value other than `true` or `false` (`arrow-at-each-box-format`).

### Overlays in the SVG file itself

The bands (and the arrows at boxes) are drawn when the diagram opens here. Opened anywhere else (a browser tab, GitHub, an image viewer), the draw.io SVG has no bands, though its legend names them. For a file that shows everything, render it:

```sh
npx diagram-webkit render my-diagram.drawio.svg --out my-diagram.svg
```

`my-diagram.svg` then has the bands and box arrows drawn in and is about half the size (draw.io's model is left out). It no longer opens in draw.io as a diagram: keep editing `my-diagram.drawio.svg` (draw.io recognises the `.drawio.svg` name) and render again after changes, or let CI do it. diagram-webkit opens both; with the rendered one it uses the bands in the file and does not draw them again. Details: [tools.md](tools.md#render).

`diagram-webkit validate` reports an `overlay` without a matching `overlay-definition` (`unknown-overlay`), a name defined twice (`duplicate-overlay-definition`), and an `overlay-definition` that is not exactly one name (`overlay-definition-format`), and `overlay-tags` on a line without `overlay-definition` (`overlay-tags-without-definition`).

### Downloading the diagram

A diagram can offer downloads in its About box (`content.downloads`, [definition.md](definition.md)):

| Row | What you get |
| --- | --- |
| draw.io original | the source; opens and can be edited in draw.io, but without the bands |
| Full diagram | the rendered SVG: everything, no filters, bands included; not a draw.io file |
| This view | made by the page when you click: the cells your level, topics and search show, their bands, your pins and notes, always in the light theme; not a draw.io file |

"This view" keeps each note's title and text as a tooltip (`<title>`) in the file.

### Help text

The first line of `help` is the title. Everything after it is the explanation:

```
Load balancer
Terminates TLS and forwards requests to the web app.
Only the load balancer is reachable from the internet.
```

The explanation may use simple HTML: `<b>`, `<i>`, `<code>`, lists (`<ul><li>`), tables, links (`<a href="https://...">`). Anything else is shown as text. Images in help text are not shown.

Examples go in more properties on the same part, one per example: `help.<formatter>.<name>`, with the code as the value. The tab is named after `<name>`, in lowercase, with `_` as a space. The formatter colours the code:

| Formatter | For |
| --- | --- |
| `text` | anything, no colours |
| `shell` | commands: `$` prompt, `#` comments, flags, variables, strings |
| `yaml` | keys, comments, strings, `true`/`false`/numbers |
| `json` | keys, strings, literals |
| `log` | timestamps, levels (`ERROR`, `WARN`, `INFO`, ...), `key=value` |
| `containerfile` | instructions (`FROM`, `RUN`, ...), comments, variables |

An unknown formatter is shown as `text`, and `validate` warns about it.

Tip: put help on a small `?` marker shape next to the part it explains, and give the marker the same tags as that part, so it disappears together with it.

### Slugs

Give every part that has `help` a `slug`:

- unique in the diagram,
- letters and digits only, up to 20 characters, `PascalCase` (`DbAccess`, `LoadBalancer`),
- named after what the help explains, not where it is.

Pins and links use the slug. Renaming a slug breaks old links that pinned it.

### Saving as SVG

Save the diagram itself as an SVG; there is no separate export step and no `.drawio` file to keep next to it.

1. **File → Save as…**
2. Pick the **SVG** format (draw.io's editable SVG) and save as `my-diagram.svg`.
3. From then on, open `my-diagram.svg` in draw.io, edit, and save. The same file is your source and what diagram-webkit shows.

The file starts with `<!-- Do not edit this file with editors other than draw.io -->`; that is expected. draw.io's light/dark colours and a transparent background are fine: diagram-webkit always draws the diagram light on white and makes its own dark theme.

**File → Export as → SVG…** with **Include a copy of my diagram** also works, but then you have to export again after every change.

If the diagram contains pictures, they must be inside the file. Pictures that point elsewhere on the internet are removed when the diagram is opened here.

Check the result: open the `.svg` in a text editor and search for `data-tags`. Your properties should appear as `data-tags="…"`, `data-help="…"` and `data-slug="…"` (and `data-overlay="…"`, `data-overlay-definition="…"`). If they do not, update draw.io; the properties are what everything else builds on.

For a thorough check, the command line tool reports unknown tags, missing parents, duplicate or missing slugs, overlays without a definition, and more:

```sh
npx diagram-webkit validate my-diagram.svg
# or, from a clone of the repository:
node packages/diagram-webkit/src/tools/cli.js validate my-diagram.svg
```

### A small example

A web service with a load balancer, an app and a database:

| Shape | `tags` | `help` | `slug` |
| --- | --- | --- | --- |
| User | `Network Network.Ingress` | | |
| Load balancer | `level-1 Network Network.Ingress` | `Load balancer` / `Terminates TLS …` | `LoadBalancer` |
| Web app | | `Web app` / `Stateless HTTP service …` | `WebApp` |
| Database | `level-1 Data` | `Database` / `Holds the orders …` | `Database` |
| Cache | `level-2 Data Data.Cache` | `Cache` / `Read-through …` | `Cache` |
| Line LB → app | `level-1 Network Network.Ingress` | | |

At level 0 you see the user and the web app. Level 1 adds the load balancer and the database, level 2 the cache. Hiding `Network` removes the user, the load balancer and its line.

## How it works

For the curious; nothing here is needed to use it.

- **The SVG is the diagram.** draw.io writes your properties onto each part as `data-tags`, `data-help` and `data-slug`. diagram-webkit reads them, builds the tag tree, the levels and the search index, and shows or hides parts by changing their visibility. Nothing is redrawn; you see draw.io's own drawing.
- **Overlays** are the one thing drawn on top: once, when the diagram opens, from the lines' own path data. They are added to the SVG as copies of the definition line's path, one group per overlay, with the transparency on the group so overlapping bands do not get darker.
- **Opening a diagram** reads the file in the browser (file picker, drag and drop, or a fetch of the link you gave). It is parsed in an isolated document first, where nothing in it can run.
- **Cleaning.** Before a diagram you opened is shown, scripts, event handlers, `javascript:` links, embedded frames and forms are removed, and so are references to anything outside the file (images, fonts, stylesheets on other servers). Help text is limited to simple formatting and links. A diagram from someone else can therefore not run code in your browser or reveal that you opened it.
- **The address is the state.** Position, level, filters, search, pins and annotations are written to the address as you go (`?v=…&filter-level=…&pins=…`), so the address is always a link to what you see.
- **The diagram in the link.** `#svg=` holds either the address of the SVG (when you opened it from a link) or the SVG itself: compressed (deflate) and written in a form that is safe in an address (base64url). Opening such a link reverses that. The part after `#` stays in the browser.
- **Your settings** (theme, whether you have seen the intro) are kept in this browser's local storage and nowhere else.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| "is not an SVG file" | Save from draw.io as SVG (not PNG, not `.drawio`). |
| "Could not load …" for a link | The site does not allow reading the file from other pages, or you are offline. Download the file and open it. |
| "The diagram in this link could not be read" | The link was cut off, often by a chat tool. Ask for the file, or a shorter link (fewer annotations). |
| No tags in the menu, no help on hover | The SVG has no `data-tags` / `data-help`. See [Saving as SVG](#saving-as-svg). |
| "Warnings in the developer console" in the top left corner (while developing) | Open the browser's developer console: the engine says there what it left out and why (`diagram-webkit: line overlay: …`). Fix it in draw.io and reload. |
| No overlay band | The property must be `overlay` on the line itself (Edit Data), not inside `tags`, and a line with `overlay-definition` of the same name must exist. The browser console (`diagram-webkit: line overlay: …`) says what was skipped. |
| Two overlay bands swap sides at a box | The lines on each side list the overlays in orders that disagree, seen along their arrows. Swap the order in `overlay` on one of them. |
| A band passes through a box it should end at | Set `overlay-destination = true` on the box. |
| An overlay band stops at a box | The next line does not leave that box (it arrives at it too), or has no `overlay` with the same name. |
| No arrow at a box on an `arrow-at-each-box` line | The box is drawn before the line (bring it to the front in draw.io), has no fill, or is a marker (`pri-N`, `info`). Set `arrow-at-each-box = true` on the box to force one. |
| An arrow at a box where none belongs | Set `arrow-at-each-box = false` on that box. |
| A tag cannot be shown again | Its parent is hidden. Show the parent (the menu says which). |
| Something is missing | Check the level and the hidden tags in the menu, or press **Clear all filters**. |
| Pictures are gone | They pointed to the internet. Put the pictures into the diagram itself. |

## For developers

diagram-webkit is also a library: put your own diagram on your own site with its own texts, colours, views and settings, embed it in a page, or use it in reveal.js presentations. See the [developer documentation](README.md), and the source on [GitHub](https://github.com/diagram-webkit/diagram-webkit).

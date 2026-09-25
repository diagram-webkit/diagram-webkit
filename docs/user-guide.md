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

### Help text

Parts of the diagram can carry a short explanation. Hover over them (or tap on a touch screen) to read it. In many diagrams these parts are marked with a small **?**, but anything can have help text.

### The menu

The menu button (bottom right) opens a panel with everything for narrowing down what you see:

- **Search** (`/` jumps to it) looks through all help text. Parts with matching help stay, the other parts with help are hidden. Click a result to jump to it.
- **Level** controls the amount of detail. Level 0 is the overview; each step up adds more. "max" shows everything.
- **Tags** are the topics of the diagram, as a tree. Click a topic to hide it and everything under it in the tree. **Show all**, **Hide all** and **Invert** work on the whole tree, and the filter field finds a tag by name. **Reset** (shown once something is hidden or in focus) brings back every tag and ends the focus.
- Hover a tag in the tree for **focus**: it zooms to that topic and highlights it, and stays lit while on. Focus on several at once. **Dim others** (in yellow, after Show all / Hide all / Invert) fades out everything else while something is in focus. Hiding a topic ends its focus.
- A diagram opened without its own settings gets the same menu: priorities (`pri-1`, `info`) in their own group, and the other tags as the tree.
- **Pinned** lists what you pinned (see below). **Clear** unpins everything; **Hide** folds the list.

Anything hidden explains itself when you look for it: a search result that is filtered out says which tag or level hides it.

### Pins

Pin a part with the pin button in its help text. Pinned parts are marked in the diagram and listed in the menu, so you can come back to them, show only them, or send them to someone. Pins are part of the link.

### Your own notes (annotations)

Under **User Annotations** in the menu you can add your own points, areas and arrows, each with a title and a description. Turn on **Edit Mode** to move and resize them. They are part of the link, so whoever opens it sees your notes too.

Descriptions can use a little formatting (bold, italics, line breaks); everything else is shown as plain text.

### Dark theme

The theme button at the top of the menu switches between light and dark. Your choice is remembered in this browser.

## Sharing

The address in your browser always describes what you see: the position, the level, the hidden tags, the search, pins, annotations and, for a diagram you opened yourself, the diagram itself. Copy it, and the person you send it to sees the same thing.

The **?** at the bottom left opens a dialog with tabs: **Open diagram**, **About**, **Share** (ready-made links to copy, and the diagram file), **URL parameters** (what each part of the address means, grouped by what it does) and **Controls** (mouse, touch and keys). The `?` key opens it on Controls, the left and right arrow keys switch tabs, and the bottom of the dialog shows the version.

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

### Help text

The first line of `help` is the title. Everything after it is the explanation:

```
Load balancer
Terminates TLS and forwards requests to the web app.
Only the load balancer is reachable from the internet.
```

The explanation may use simple HTML: `<b>`, `<i>`, `<code>`, lists (`<ul><li>`), tables, links (`<a href="https://...">`). Anything else is shown as text. Images in help text are not shown.

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

Check the result: open the `.svg` in a text editor and search for `data-tags`. Your properties should appear as `data-tags="…"`, `data-help="…"` and `data-slug="…"`. If they do not, update draw.io; the properties are what everything else builds on.

For a thorough check, the command line tool reports unknown tags, missing parents, duplicate or missing slugs, and more:

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
| A tag cannot be shown again | Its parent is hidden. Show the parent (the menu says which). |
| Something is missing | Check the level and the hidden tags in the menu, or press **Clear all filters**. |
| Pictures are gone | They pointed to the internet. Put the pictures into the diagram itself. |

## For developers

diagram-webkit is also a library: put your own diagram on your own site with its own texts, colours, views and settings, embed it in a page, or use it in reveal.js presentations. See the [developer documentation](README.md), and the source on [GitHub](https://github.com/diagram-webkit/diagram-webkit).

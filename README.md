# pinax

a chrome extension to save pages for later, sort them into collections, and keep your tabs tidy.

sorting uses chrome's built-in ai (gemini nano). it runs on your computer, no account or api key needed. without it, simple rules are used.

![inbox](screenshots/inbox.png)
![all pages](screenshots/all-pages.png)
![popup](screenshots/popup.png)

## install

easiest way (no git needed):

1. download `pinax-extension.zip` from the [latest release](../../releases/latest) and unzip it
2. open `chrome://extensions` and turn on developer mode (top right)
3. click **load unpacked** and pick the unzipped folder
4. pin it from the puzzle-piece menu

or clone this repo and pick the repo folder in step 3. to update, download the new zip (or `git pull`) and press the reload arrow on the extension card.

chrome only installs extensions outside its web store this way (developer mode). needs chrome 138 or newer on desktop.

## use

- save the current page with `alt+shift+s`, or from the popup
- open the library with `alt+shift+l`
- organise the tabs of a window into groups with `alt+shift+o`
- highlight text on a page and keep notes

all data stays in your browser. more details in [docs/features.md](docs/features.md).

license: [MIT](LICENSE)

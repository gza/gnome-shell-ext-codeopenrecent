# GNOME VSCode workspace SearchProvider

## Current Status

* I use it everyday and it works well for me.
* Not published on extensions.gnome.org yet.

## Installation

1. Clone this repository into `~/.local/share/gnome-shell/extensions/`:

```bash
cd ~/.local/share/gnome-shell/extensions/
git clone https://github.com/gza/gnome-shell-ext-codeopenrecent.git codeopenrecent@webgr.fr
```

2. Enable the extension:

```bash
gnome-extensions enable codeopenrecent@webgr.fr
```

## Upgrade

1. Pull the latest changes from the repository:

```bash
cd ~/.local/share/gnome-shell/extensions/codeopenrecent@webgr.fr
git pull
```

2. Restart GNOME Shell

## dev/testing

* install mutter-devkit
* `dbus-run-session gnome-shell --devkit --wayland`

## Contributing

Contributions are welcome. Please open a pull request.

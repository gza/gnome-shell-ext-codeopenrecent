# GNOME VSCode workspace SearchProvider

## Current Status

- I use it everyday and it works well for me.
- Not published on extensions.gnome.org yet.

## Installation

1. Clone this repository into `~/.local/share/gnome-shell/extensions/`:

```bash
cd ~/.local/share/gnome-shell/extensions/
git clone https://github.com/gza/gnome-vscode-workspace-search.git vscode-workspace-search@gza.github.com
```

2. Enable the extension:

```bash
gnome-extensions enable vscode-workspace-search@gza.github.com
```

## Upgrade

1. Pull the latest changes from the repository:

```bash
cd ~/.local/share/gnome-shell/extensions/vscode-workspace-search@gza.github.com
git pull
```

2. Restart GNOME Shell

## dev/testing

- install mutter-devkit
- `dbus-run-session gnome-shell --devkit --wayland`

## Contributing

Contributions are welcome. Please open a pull request.

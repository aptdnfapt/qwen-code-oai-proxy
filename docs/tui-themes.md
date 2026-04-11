# TUI Themes

The terminal UI supports multiple color themes so users can pick one that looks correct on their terminal background.

## Available themes

- `dark` --> default dark-terminal palette
- `light` --> better for light terminal backgrounds
- `amber` --> warm amber/yellow look
- `contrast` --> high-contrast white-heavy palette

## How to switch

- Open the TUI --> `Settings` --> `Theme`
- Or press `t` to cycle themes

## Persistence

Theme choice is saved automatically to:

- `~/.local/share/qwen-proxy/config.json`

The next time the TUI starts, it loads the saved theme automatically.

## Selection style

You can also choose how selected rows look:

- `solid` --> filled highlight
- `transparent` --> bold text + accent left marker, keeps row colors visible

This is saved in the same config file and auto-loads on next start too.

## Notes

- This changes TUI text, borders, highlights, and button colors
- It does not change your terminal emulator background color

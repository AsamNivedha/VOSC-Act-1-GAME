[README.md](https://github.com/user-attachments/files/32858653/README.md)
# NEBULA — Space Defender

A neon arcade shooter that runs in the browser. Pilot your ship, blast waves of enemies, grab power-ups, and chase a high score. Built with plain HTML, CSS and JavaScript, with no libraries and no build step.

## Play

Open `index.html` in any modern browser, or host the three files (see below).

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | ← → or A D | Drag on the game area |
| Shoot | Space (hold) | Automatic while touching |
| Pause / resume | P or Esc | Switches tabs to auto-pause |
| Sound on/off | M | Sound button |

## Gameplay

- Stop every enemy before it reaches the bottom. You start with 3 lives (max 5).
- Enemies that get past you, or crash into your ship, cost a life.
- Clear all enemies in a wave for a bonus and move on to a faster, bigger wave.
- Chain kills quickly to build a combo multiplier (up to ×8).
- Your best score is saved in your browser.

### Enemies

| Enemy | Behaviour | Points |
| --- | --- | --- |
| Drone | Drifts down with a gentle sway | 100 |
| Zig-zagger | Weaves side to side (from wave 2) | 150 |
| Tank | Takes 3 hits (from wave 3) | 300 |

### Power-ups

| Power-up | Effect | Duration |
| --- | --- | --- |
| Shield (cyan) | Blocks hits and lets you ram enemies | 8 s |
| Rapid fire (amber) | Much faster shooting | 10 s |
| Tri-shot (magenta) | Fires three bullets at once | 10 s |
| Extra hull (green) | Restores one life | Instant |

## Files

```
index.html   Page structure, HUD and menu screens
style.css    Neon look, layout and animations
script.js    Game logic, drawing, input and sound
```

Keep all three in the same folder. The file names must stay exactly as shown.

## Host it for free

**GitHub Pages**

1. Create a public repository on GitHub.
2. Upload `index.html`, `style.css` and `script.js`.
3. Go to **Settings → Pages**, pick your main branch, and save.
4. Your game goes live at `https://<username>.github.io/<repository>/`.

**Netlify Drop:** drag the folder onto <https://app.netlify.com/drop> to get an instant link.

## Tweaking the game

Most settings are at the top of `script.js` or inside a few small functions:

- `START_LIVES`, `MAX_LIVES`: how many lives you get.
- `DURATION`: how long each power-up lasts.
- `startWave()`: enemies per wave (`6 + wave * 3`).
- `spawnEnemy()`: enemy types, speeds and points.
- `maybeDrop()`: how often power-ups appear.

Colours are set in `:root` at the top of `style.css`.

## Technical notes

- Drawn on an HTML canvas at 800 × 600 logical pixels and scaled to fit any screen.
- Sound effects are synthesised with the Web Audio API, so there are no audio files.
- Audio starts after your first tap or key press, as browsers require.
- The high score and sound setting are stored with `localStorage`.
- Respects `prefers-reduced-motion` for the menu animations.

## License

Free to use and modify for your own projects.

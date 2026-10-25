# Exercise library

`exercises.json` is built by `scripts/build_library.py` from **Free Exercise DB**
(https://github.com/yuhonas/free-exercise-db), pinned to commit `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`.
Free Exercise DB restructures **wrkout/exercises.json** by Ollie Jennings (https://github.com/wrkout/exercises.json).

- **License:** both datasets are released into the public domain under the Unlicense.
  Attribution isn't required; it's given here as thanks.
- **What's kept:** id, name, level, equipment, category, mechanic, muscles, instructions and image paths.
  `groups` maps the dataset's muscles to the groups Ritmo counts sets for (quads, hamstrings, glutes, adductors,
  calves, chest, back, shoulders, arms, core).
- **Images** are not stored in this repo. The app loads them from raw.githubusercontent.com at the pinned commit
  (`image_base` in the JSON), the hosting the dataset's README recommends.

Nothing from wger, Liftosaur or Lyfta is used: no code, exercise data, images or program files.
Coaching cues, swaps and load steps for Damian's exercises are written for this project and live in
the private repo's `data/exercises.json`.

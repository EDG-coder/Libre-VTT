# Plugins built into the phone and tablet apps

The Android, iPhone and iPad apps do not import plugins: the stores do not accept code downloaded or added after
review. They only use the plugins placed in this folder, which go inside the app at every build. Each one stays
off until the person using the app turns it on from ⚙ › Plugin.

For now the folder is empty. A plugin is added as a folder with its `plugin.json` (see `docs/plugins.md`), and
reaches users with the next app update.

On the computer this folder is not used: there plugins are imported from ⚙ › Plugin.

# Contributing to LIBRE VTT

Thanks for your interest! Every bit of help counts: bug reports, ideas, translations, code, plugins.

## Reporting a problem or suggesting an idea

Open an [issue](https://github.com/EDG-coder/Libre-VTT/issues/new/choose) and pick the right form. For a bug we
need the version, the system and the steps to make it happen again: with these it gets fixed much sooner. For
security problems follow [SECURITY.md](SECURITY.md) instead.

## Running the program from the source code

You only need [Node.js](https://nodejs.org) 22 or newer: no `npm install`, the project has no dependencies.

    npm start          # http://localhost:3000, in the browser
    npm run app        # like the installed app (home with «Play alone», «I'm the GM», «Join a game»)
    npm run server     # dedicated server, no windows

The project folders are described in the [README](README.md#the-project-folders).

## Project rules

- **No text from the official D&D books** in the repository: no spells, no monsters, no copied descriptions. SRD
  material (with its attribution) is fine, and so are tools that read, on the user's own computer, the PDFs they
  own.
- **Languages**: new code and comments in English or Italian. Interface texts go through
  `tr('Italian sentence')` and the English translation goes in `web/js/base/lingua-en.js`.
- **No new dependencies** without discussing it first: the program must keep working with Node.js alone, even
  offline.
- One pull request per topic, with a description of what changes and how you tested it (system, browser, alone or
  over the network).

## Plugins

To extend the program without touching it, read the guide [docs/plugins.md](docs/plugins.md) and start from one
of the templates in `examples/plugins/`.

## License

By contributing you agree that your work is distributed under the same license as the project,
[AGPL-3.0](LICENSE). Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

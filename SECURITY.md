# Security

## Supported versions

Security problems are fixed only in the **latest version** published on the
[Releases](https://github.com/EDG-coder/Libre-VTT/releases) page. If you use an older version, update before
reporting.

## How to report a problem

**Do not open a public issue** for a security problem.

Use GitHub's private reporting instead:
[Security › Report a vulnerability](https://github.com/EDG-coder/Libre-VTT/security/advisories/new).

Include:
- the LIBRE VTT version and the system (Windows, macOS, Linux, Android, iPhone);
- how you were playing when it happens (alone, «I'm the GM», «Join a game», dedicated server, website);
- the steps to reproduce it and what someone exploiting it can do.

I answer as soon as I can, usually within a week. Once the fix is published the report becomes public, with your
name if you want.

## What counts as a security problem

For example:
- a player who sees what the master hid (fog, «Hidden» layer, private sheets) or becomes master without the key;
- someone from outside who reaches the local ports (3000, 4000, 4100) and changes or reads the data;
- a plugin in protected mode (sandbox) that escapes the protection;
- a file (image, SVG, pack, .uvtt map, .zip campaign) that runs code or writes outside its folder;
- a download (Node.js, remote link, Rust/Zig) accepted without checking its fingerprint;
- the website relay delivering a player's messages to anyone other than the master, or letting someone act as
  master of a room that is not theirs.

Plugins with **full access** are not security problems: they do whatever they want by choice of whoever installs
them, after the two warnings.

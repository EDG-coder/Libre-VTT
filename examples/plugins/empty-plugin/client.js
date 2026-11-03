// Your plugin starts here. The guide is docs/plugins.md (in the LIBRE VTT project on GitHub).
// Save this file, then switch the plugin off and on in ⚙ › Plugin: the table picks up the change.
export function activate(vtt) {
  vtt.commands.add('hello', () => vtt.chat.write(vtt.t('hello')));
}

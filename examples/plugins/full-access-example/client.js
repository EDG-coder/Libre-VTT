// A full-access plugin: it runs inside the table, like LIBRE VTT's own code.
// vtt.hook(name, { before, replace, after }) works on any function of the table:
// vtt.registry.list() gives the whole list; the English aliases (chat.add, dice.roll, net.send…)
// are the stable names to prefer. Everything done through vtt.* is undone when the plugin is switched off.
export function activate(vtt) {
  let rolled = vtt.storage.get('rolled') || 0;

  // before: change the arguments (here: the time in front of what you write)
  vtt.hook('chat.send', {
    before: () => {
      const box = document.getElementById('chatInput');
      const text = box && box.value.trim();
      if (text && !text.startsWith('/')) box.value = `[${new Date().toLocaleTimeString(vtt.lang, { hour: '2-digit', minute: '2-digit' })}] ${text}`;
    }
  });

  // after: look at the result (here: count the dice rolled from the dice panel)
  vtt.hook('dice.roll', {
    after: (result, [sides]) => { rolled++; vtt.storage.set('rolled', rolled); }
  });

  vtt.commands.add('stats', () => vtt.chat.write(vtt.t('stats', { n: rolled })));
  vtt.ui.notify(vtt.t('hello'));
}

export function deactivate(vtt) {
  // hooks, commands and buttons go away by themselves; undo here only what you changed by hand
}

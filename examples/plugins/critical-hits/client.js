// A sandboxed plugin: it runs in an invisible frame with no network and no access to the page.
// It can only do what plugin.json → permissions allows. The texts people see come from locales/.
export function activate(vtt) {
  // chat.read: every new chat message, rolls included
  vtt.on('chat.message', msg => {
    if (msg.kind !== 'roll' || msg.provisional || msg.sides !== 20 || !Array.isArray(msg.rolls)) return;
    if (msg.rolls.includes(20)) vtt.ui.notify(vtt.t('critical', { who: msg.by || vtt.t('someone') }));
  });

  // chat.commands + chat.write: /coin (or /moneta) in the chat box
  const coin = () => vtt.chat.write(vtt.t('coin', { side: vtt.t(Math.random() < 0.5 ? 'heads' : 'tails') }));
  vtt.commands.add('coin', coin);
  vtt.commands.add('moneta', coin);

  // ui.buttons: a button at the top of the table
  vtt.ui.button({ label: '🪙', title: vtt.t('coin.button'), onClick: coin });
}

export function deactivate() {
  // nothing to clean: buttons, commands and listeners are removed by LIBRE VTT
}

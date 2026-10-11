/**
 * Fill a room with autonomous bots for play-testing.
 *   npm run bots -- <ROOMCODE> [count=3] [--server http://localhost:2567] [--aggressive]
 */
import { Bot } from '../tests/support/bot';
import { runBrain } from '../tests/support/brain';

const args = process.argv.slice(2);
const code = args.find((a) => /^[A-Z0-9]{6}$/i.test(a))?.toUpperCase();
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 3);
const server = args.includes('--server') ? args[args.indexOf('--server') + 1] : 'http://localhost:2567';
const aggressive = args.includes('--aggressive');
if (!code) {
  console.error('usage: npm run bots -- <ROOMCODE> [count] [--aggressive]');
  process.exit(1);
}
const NAMES = ['Priya', 'Marcus', 'Chen', 'Olu', 'Sofia', 'Dmitri', 'Aisha', 'Tomás', 'Hana'];
for (let i = 0; i < count; i++) {
  const bot = new Bot(server, NAMES[i % NAMES.length], i + 3);
  bot
    .connect(code)
    .then(() => {
      console.log(`${bot.name} joined ${code}`);
      void runBrain(bot, { aggressive, chatty: true, seed: i * 7919 });
    })
    .catch((e) => console.error(`${bot.name} failed: ${e.message}`));
}
process.on('SIGINT', () => process.exit(0));

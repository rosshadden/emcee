#!/usr/bin/env node

import Emcee from '../lib/emcee';

async function main() {
	const mc = new Emcee('1.12.2');
	await mc.run();
}

main();

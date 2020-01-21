import _ from 'lodash';
import axios from 'axios';
import { promises as fs } from 'fs';

const version = '1.12.2';
const curse = axios.create({
	baseURL: 'https://addons-ecs.forgesvc.net/api/v2',
})

function strip(file: string) {
	return file
		.replace(/[0-9]/g, '')
		.replace(/_/g, '-')
	;
}

function findMatch(results: Array<any>, file: string) {
	return results.find((result) => {
		const match = result.gameVersionLatestFiles.find(({ gameVersion }) => gameVersion === version);
		return strip(match.projectFileName) === strip(file);
	});
}

async function update(file: string) {
	console.log('updating', file);

	// strip versions from files
	const stripped = strip(file);

	// TODO: extract zip file

	// TODO: read mcmod.info

	// search API
	const res = await curse.get('/addon/search', {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		params: {
			categoryId: 0,
			gameId: 432,
			gameVersion: version,
			index: 0,
			pageSize: 25,
			searchFilter: 'AE2 Wireless Terminals (AE2WTLib)',
			sort: 0,
		}
	});

	const results = res.data.map((result: any) => {
		return _.pick(
			result,
			[
				'id',
				'name',
				'summary',
				'latestFiles',
				'slug',
				'gameVersionLatestFiles',
			]
		);
	});

	// find filename match (after stripping remote data as well)
	const match = findMatch(results, file);

	console.log(match);

	// TODO: get download url for latest file of given (read: hardcoded) version

	// TODO: download to mods dir

	// TODO: remove old mod
}

async function main() {
	// get file list
	const files = (await fs.readdir('.'))
		.filter((file) => file.endsWith('.jar'));

	for (const file of files) {
		try {
			await update(file);
		} catch (ex) {
			console.error(''+ex);
			throw ex;
		}
		return;
	}
}

main();

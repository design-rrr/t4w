var app = new Vue({
	el: "#app",
	data: {
		current: "bitcoin",
		currentFiat: "USD",
		currencies: {
			USD: "$",
			CAD: "$",
			CNY: "¥",
			EUR: "€",
			GBP: "£",
			JPY: "¥"
		},
		bitcoin: {
			address: "",
			amount: 0,
			color: "orange",
			faucets: [
				[" - signetfaucet.com", "https://signetfaucet.com"],
				[" - alt.signetfaucet.com", "https://alt.signetfaucet.com"]
			],
			price: 0,
			tx: [
			]
		},
		msg: {
			title: "",
			status: "positive",
			reason: ""
		}
	},
	methods: {
		init: function (net) {
			var keys = BLTWallet.createNewAddress(net);
			window.location.hash = `#${net[0]}-${rot13(keys[0])}-USD`;
			window.location.reload();
		},
		checkKey: function (priv_key) {
			var network = (this.current == "bitcoin") ? bitcoinjs.networks.testnet : bitcoinjs.networks.ltestnet

			var keyPair = bitcoinjs.ECPair.fromWIF(priv_key, network);
			var address = bitcoinjs.address.toBase58Check(
				bitcoinjs.crypto.hash160(keyPair.publicKey),
				network.pubKeyHash
			)

			if (window.location.hash[1] == "b") {
				if (BLTWallet.checkValidAddress(address, 'bitcoin')) {
					this.bitcoin.address = address;
					this.current = "bitcoin";
					return true;
				}
			}

			return false;
		},
		copyAddress: function () {
			var input = document.createElement('input');
			input.setAttribute("id", "address");
			input.setAttribute("class", "hidden");
			input.setAttribute("value", this.address);
			document.body.appendChild(input);

			// copy address
			document.getElementById('address').select();
			document.execCommand('copy');

			// remove element
			input.remove();
		},
		positive_tx: function (vouts) {
			let total = 0;
			for (var i = 0; i < vouts.length; i++) {
				if (vouts[i].scriptpubkey_address == this.address) {
					total += vouts[i].value;
				};
			};
			return total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
		},
		negative_tx: function (vins, vouts) {
			let totalin = 0;
			let totalout = 0;
			vins.forEach( vin => {
				if (vin.prevout.scriptpubkey_address == this.address) {
					totalin += vin.prevout.value;
				};
			});
			vouts.forEach( vout => {
				if (vout.scriptpubkey_address == this.address) {
					totalout += vout.value;
				};
			});
			return (totalin - totalout).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
		},
		// used only in Send
		getUnspentTransactions: async () => {
			let res = await fetch(`${app.baseURL}/api/address/${app.address}/utxo`);
			//let res = await fetch(`/api/utxo.json`);
			return await res.json();
		},
		maxAmount: function () {
			if (this[this.current].amount > 5000) {
				$('#send-amount')[0].value = (this[this.current].amount - 5000);
				return;
			}
			this.msg = {
				status: "negative",
				title: "Not enough coins in wallet.",
				reason: "Try sending some more coins to this wallet. :)"
			};
		},
		sendTx: async (hex) => {
			//let res = await fetch(`/api/send.json`, {
			let res = await fetch(`${app.baseURL}/api/tx`, {
				method: "POST",
				body: hex
			});

			if (res.ok) {
				let data = await res.text();
				console.log(data);

				app.msg = data ? {
					status:"positive",
					title: "Transaction was successfully sent! Please wait for the wallet to update.",
					reason: `TXID: ${data}`
				} : {
					status: "negative",
					title: "Could not send transaction",
					reason: "Something went wrong. :("
				}
				if (data) {
					app.updateTransactions();
					$('#send-amount')[0].value = "";
					$('#receive-address')[0].value = "";
				}
			} else {
				let data = await res.json();
				//let data = await res.text();

				app.msg = {
					status:"negative",
					title: "There was an error while sending your transaction.",
					reason: data
				}
			}
		},
		sendTransaction: async () => {
			var sendAmount = parseFloat($('#send-amount')[0].value);
			var recvAddress = $('#receive-address')[0].value;

			// check for valid testnet address
			if (BLTWallet.checkValidAddress(recvAddress, app.current)) {
				if (app[app.current].amount > 0 && sendAmount <= app[app.current].amount) {
					var nw = app.current == "bitcoin" ? bitcoinjs.networks.testnet : bitcoinjs.networks.ltestnet;
					var keyPair = bitcoinjs.ECPair.fromWIF(rot13(window.location.hash.match(/(b|l)\-([a-zA-Z0-9]+)(-([A-Z]{3}))?/)[2]), nw);
					var tx = new bitcoinjs.TransactionBuilder(nw);
					let res = await app.getUnspentTransactions();
					var tx_hex = BLTWallet.buildTransaction(sendAmount, recvAddress, res, tx, keyPair);
					var fee = tx_hex.length() / 2;
					var tx_hex = BLTWallet.buildTransaction(sendAmount, recvAddress, res, tx, keyPair, fee);

					await app.sendTx(tx_hex);
					await app.updateData();
					return;
				}

				app.msg = {
					status: "negative",
					title: "Not enough coins in wallet.",
					reason: "Try sending some more coins to this wallet. :)"
				};
				return;
			}
			app.msg = {
				status: "negative",
				title: "Address is not valid",
				reason: "This is not a valid address"
			};
		},
		updateData: async () => {
			await app.updatePrices();
			await app.updateTransactions();
		},
		updateFiat: function (currency) {
			window.location.hash = window.location.hash.replace(/-[A-Z]{3}$/g, '-' + currency);
			window.location.reload();
		},
		updatePrices: async () => {
			let res = await fetch(`https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,LTC&tsyms=${app.currentFiat}&api_key=9718793cd89ec64a59e010eefa4a49171c4773bc30e2ceaa4cf03ad37e1f6deb`);
			//let res = await fetch(`/api/cryptocompare.json`);
			let data = await res.json();

			app.bitcoin.price = data['BTC'][app.currentFiat];
		},
		updateTransactions: async () => {
			let res = await fetch(`${app.baseURL}/api/address/${app.address}`);
			//let res = await fetch(`/api/addr.json`);
			let data = await res.json();

			//if (app[app.current].amount != data['balance']) {
			//	document.getElementById('audio').play();
			//}

			app[app.current].amount = (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum);

			res = await fetch(`${app.baseURL}/api/address/${app.address}/txs`);
			//res = await fetch(`/api/txs.json`);
			data = await res.json();

			app[app.current].tx = data.length ? data : [];
		}
	},
	computed: {
		address: function () {
			return this[this.current].address;
		},
		amount: function () {
			return `${this[this.current].amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} sat`;
		},
		baseURL: function () {
			return "https://mempool.space/signet"
		},
		color: function () {
			return this[this.current].color;
		},
		faucets: function() {
			return this[this.current].faucets;
		},
		fiat_amount: function () {
			return `${this.currencies[this.currentFiat]}${(this[this.current].amount * this[this.current].price / 100000000).toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ${this.currentFiat}`;
		},
		transactions: function () {
			return this[this.current].tx;
		}
	}
})

let BLTWallet = {
	buildTransaction(sendAmount, recvAddress, inputs, tx, keyPair) {
		var spendAmount = 0;
		var num_inputs = 0;

		inputs.sort(function (a, b) { return a.value > b.value });
		inputs.forEach(function(intx) {
			if ((sendAmount + fee) > spendAmount){
				spendAmount += intx.value;
				num_inputs += 1;
				tx.addInput(intx.txid, intx.vout);
			}
			return;
		});

		// check if there is enough balancekm
		if (spendAmount < sendAmount + fee) {
			app.msg = {
				status: "negative",
				title: "Not enough coins in wallet.",
				reason: "Try sending some more coins to this wallet. :)"
			};
		} else {
			tx.addOutput(recvAddress, sendAmount);
			var diff = (spendAmount - sendAmount - fee);
			if (diff > 10000) tx.addOutput(app[app.current].address, diff);
			for (var i = 0; i < num_inputs; i++) {
				tx.sign(i, keyPair);
			}
		}

		return tx.buildIncomplete().toHex();
	},
	createNewAddress(network){
		var nw = network == "bitcoin" ? bitcoinjs.networks.testnet : bitcoinjs.networks.ltestnet;
		var keyPair = bitcoinjs.ECPair.makeRandom({ network: nw });
		var address = bitcoinjs.address.toBase58Check(
			bitcoinjs.crypto.hash160(keyPair.publicKey),
			nw.pubKeyHash
		)

		return [keyPair.toWIF(), address];
	},
	checkValidAddress(address, network) {
		try {
			return bitcoinjs.address.fromBase58Check(address, network == "bitcoin" ?
				bitcoinjs.networks.testnet : bitcoinjs.networks.ltestnet
			);
		} catch(err) {
			try {
				return bitcoinjs.address.toOutputScript(address, network == "bitcoin" ?
					bitcoinjs.networks.testnet : bitcoinjs.networks.ltestnet
				);
			} catch(err) {
				return false;
			}
		}
	}
}

// rot13 implementation
// https://stackoverflow.com/questions/617647/where-is-my-one-line-implementation-of-rot13-in-javascript-going-wrong
function rot13(str) {
  return str.replace(/[a-zA-Z]/g, function(chr) {
	var start = chr <= 'Z' ? 65 : 97;
	return String.fromCharCode(start + (chr.charCodeAt(0) - start + 13) % 26);
  });
}

function showModal() {
	$('.modal').modal('show');
}

$(document).ready(function() {
	// check if valid wallet address
	if (/(b|l)\-([a-zA-Z0-9]+)-([A-Z]{3})/.test(window.location.hash)) {
		// set currency
		var user_currency = window.location.hash.match(/(b|l)\-([a-zA-Z0-9]+)(-([A-Z]{3}))?/)[4];
		if (user_currency in app.currencies) {
			app.currentFiat = user_currency;
		}
		try {
			if (app.checkKey(rot13(window.location.hash.match(/(b|l)\-([a-zA-Z0-9]+)(-([A-Z]{3}))?/)[2]))) {
				app.updateData();
			}
		} catch(err) {
			app.init('bitcoin');
		}
	} else {
		app.init('bitcoin');
	};
	$('.ui.dropdown').dropdown();
	setInterval(app.updateData, 30 * 1000);
});

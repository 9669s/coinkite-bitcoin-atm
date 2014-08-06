// Global config here... sigh
//
var CK_API_HOST = 'https://api.coinkite.com';
//var CK_API_HOST = 'http://lh:5001';
var CK_API_KEYS = {};

var app = angular.module('cc-example-module', ['mgcrea.ngStrap', 'restangular']);


app.controller('mainController', function($scope, Restangular, $sce, $alert, $timeout)
{
    // are we working with "real" coins, or just in demo mode?
    $scope.real_money = false;

    // NOTE: This endpoint is public and does not require any API key to read.
    $scope.rates = {};
    $scope.reload_rates = function() {
        Restangular.one('public/rates').get().then(function(r) {
            console.log("Got rate-list list ok");
            var rates = r.rates;

            // make up some numbers for testnet...
            rates['XTN'] = angular.copy(rates['BLK'])
            _.forEach(rates['XTN'], function(r) {
                r.rate *= 1000;
            });

            $scope.rates = rates;
        });
    }
    $scope.reload_rates();

    // We will only display these crypto currencies. Comment them out to not support
    var all_currencies = [
      { code: 'BTC', name: 'Bitcoin', sign: 'Ƀ' },
      { code: 'LTC', name: 'Litecoin', sign: 'Ł' },
      { code: 'BLK', name: 'Blackcoin', sign: 'Ѣ' },
      { code: 'XTN', name: 'Testnet3', sign: '❀' },
    ];
    $scope.currencies = angular.copy(all_currencies)

    // List your local fiat currencies here, in order of preference.
    $scope.fav_currencies = [ 'CAD', 'USD', 'CNY' ];

    $scope.filter_fav_currency = function(pair) {
        // some JS logic because I can't get angular to do this in the template.
        //console.log("pair = ", pair);
        return _.contains($scope.fav_currencies, pair.code);
    };

    $scope.possible_bills = [
        { label:'C$5 CAD', value: { amount: 5, cct: 'CAD', sign: 'C$'}},
        { label:'$5 USD', value: { amount: 5, cct: 'USD', sign: '$'}},
        { label:'NZ$5 NZD', value: { amount: 5, cct: 'NZD', sign: 'NZ$'}},
        { label:'€5 EUR', value: { amount: 5, cct: 'EUR', sign: '€'}},
        { label:'₩5000 KRW', value: { amount: 5000, cct: 'KRW', sign: '₩'}},
        { label:'¥100 CNY', value: { amount: 100, cct: 'CNY', sign: '¥'}},
        { label:'руб 1000', value: { amount: 1000, cct: 'RUB', sign: 'руб'}},
    ];


    // reset all state here.
    $scope.reset_all = function() {
        // these have to be picked by the user
        $scope.txn = {
            coin_type: null,
            method: null,               // qr, email, sms or address
            dest_address: null,
            dest_email: null,
            dest_phone: null,

            // what they have inserted so far
            deposit_list: [],

            // XXX max amount they can deposit

            busy: false,
        };
    };
    $scope.reset_all();

    $scope.$watch('txn.coin_type', function(newVal, oldVal) {
        // They have picked a new currency. Fetch balance for that
        // account?
        if(!newVal) return;
        console.log("new coin type: ", newVal.code);
        // XXX add code here:
        //  - check we have some coins of that type to sell right now (balance)
        //  - setup a limit so they don't deposit more than we can sell.
    });

    $scope.need_qr = function() {
        return $scope.txn.method == 'qr' && !$scope.txn.dest_address;
    };

    $scope.cash_ready = function() {
        // when are we ready to accept bills?
        return $scope.txn.coin_type && $scope.txn.method
                 && ($scope.txn.method != 'qr' || $scope.txn.dest_address)
                 && ($scope.txn.method != 'email' || $scope.txn.dest_email)
                 && ($scope.txn.method != 'sms' || $scope.txn.dest_phone);
    };

    $scope.can_stop = function() {
        // when are we ready to complete the transaction?
        return $scope.cash_ready() && $scope.txn.deposit_list.length;
    };

    $scope.new_address = function(pk) {
        console.log("New key: ", $scope.txn.dest_address);
    };

    $scope.insert_bill = function(bill) {
        // see if we can add to existing entry first.
        for(var i=0; i < $scope.txn.deposit_list.length; i++) {
            var h = $scope.txn.deposit_list[i];

            if(h.cct == bill.value.cct) {
                // match; they already have put in some of this type
                h.amount += bill.value.amount
                return;
            }
        }

        $scope.txn.deposit_list.push(angular.copy(bill.value));
    };

    $scope.current_quote = function() {
        if(!$scope.txn.coin_type) return;

        var tot = 0;
        var cct = $scope.txn.coin_type.code;
        var lst = $scope.txn.deposit_list;
        var pairs = $scope.rates[cct];

        for(var i=0; i < lst.length; i++) {
            var h = lst[i];
            var ex = pairs[h.cct].rate;
            tot += h.amount / ex;
            // XXX no credit for pairs we don't know how to convert!
        }

        // clear some junk bits
        if(tot > 1000) {
            tot = tot.toFixed(2);
        } else if(tot > 0.01) {
            tot = tot.toFixed(4);
        }

        return Number(tot).toFixed(8);
    };

    $scope.$on('new_account_list', function(evt, lst) {
        console.log("New acct list!? ", lst);
        // This means:
        // - we have working API keys
        // - a list of accounts has been fetched already
        // So:
        // - pick which accounts to use (first of each currency
        // - remove currencies we can't support.
        $scope.currencies = new Array();
        _.forEach(all_currencies, function(c, idx) {
            var ff = _.find(lst, {coin_type: c.code});
            if(ff) {
                var linkage = angular.copy(c);
                linkage.account = ff.CK_refnum;
                $scope.currencies.push(linkage);
            }
        });
        if(!$scope.currencies.length) {
            alert("No subaccounts linked are useable?");
            // we will be broken now...
            $scope.currencies = angular.copy(all_currencies);
            $scope.real_money = false;

            return;
        }
        $scope.real_money = true;

        /* debug code: preload a sample completed txn
        Restangular.one('/v1/detail/423EB1246C-E3F081').get().then(function(r) {
            $scope.txn.result = r.detail;
        });
*/
    });

    $scope.print_and_done = function() {

        // copy over the receipt
        var v = angular.element(document.getElementById('proto-txn')).html();
        $scope.last_receipt = $sce.trustAsHtml(v);
        $scope.txn.busy = false;

        $scope.reset_all()
    };

    $scope.show_err = function(resp) {
        // use as a promise.catch handler
        console.log("Failed REST response: ", resp);
        var err = resp.data;
        $alert({title: resp.status + ': ' + err.message,
                content: (err.help_msg || "No extra help, sorry"),
                placement: 'top', type: 'danger', show: true });

        $scope.txn.busy = false;
    };

    $scope.finalize_transaction = function() {
        // Tried and failed to use modals here.
        var txn = $scope.txn;
        txn.busy = true;

        // Perform the actual transaction.
        if(!txn.coin_type.account) {
            console.error("No API key so just a demo");
            var aa = $alert({title: 'Just Playing',
                    content: 'Since no API key is configured, we\'ll just pretend that worked...',
                    placement: 'top', type: 'info', show: true, duration:15 });
            $scope.print_and_done();
        } else {
            var m = txn.method;
            var dest = 'voucher';
            if(m == 'email') {
                dest = txn.dest_email;
            } else if(m == 'sms') {
                dest = txn.dest_phone;
            } else if(m == 'qr') {
                dest = txn.dest_address;
            }

            // Setup a PUT to specific endpoint, with "object" of arguments... ahem.
            var newbie = Restangular.one('v1/new/send');
            newbie.amount = $scope.current_quote();
            newbie.dest = dest;
            newbie.incl_pin = (dest != 'voucher');
            newbie.account = txn.coin_type.account;

            newbie.put().then(function(r) {
                // Next step is to confirm the funds send. Might have some auditing/policy
                // check here IRL.
                var step2 = Restangular.one('v1/update/' + r.result.CK_refnum + '/auth_send');
                step2.authcode = r.result.send_authcode;

                step2.put().then(function(r2) {
                    // It worked. Funds are on the way, unfortunately, we don't know the
                    // p2p transaction number yet.
                    txn.result = r2.result;
                    console.log("Completely Done: ", txn);

                    // need to get out for a bit before we print, so the DOM is
                    // updated with txn.result above.
                    $timeout($scope.print_and_done, 200);

                }, $scope.show_err);
            }, $scope.show_err);
        }
    };
});

app.controller('CKAuthCtrl', function($scope, $http, $log, Restangular, $rootScope)
{
    // Initial state for variables.
    $scope.auth = {
        api_key: '',
        api_secret: '',
    };

    // Try to populate keys with useful defaults... ok if this fails.
    $http({method:'GET', url:'my-keys.json'}).success(function(d, status) {
        if(status == 200) {
            // Set the keys from the file's data.
            if(d.host) {
				CK_API_HOST = d.host;
				Restangular.setBaseUrl(CK_API_HOST);
			}
            angular.extend(CK_API_KEYS, d);
            $scope.auth = d;

            $log.info("Got your keys");
        } else {
            $log.info("NOTE: You can add a JSON file in 'my-keys.json' in this directory"
                        +" to pre-fill your key values.");
        }
    });

    // Monitor the auth keys, and fetch the account list when/if they change.
    $scope.auth_ok = false;

    // Whenever the keys change (or are set right), fetch the account
    // list as a test and also to start configuring ourselves to suit the new user's
    // account types.
    //
    $scope.$watchCollection('auth', function(newVal, oldVal) {
        if(!newVal.api_key || !newVal.api_secret) {
            // Empty API key or secret -- not an error.
            $scope.auth_ok = false;
            return;
        }

        // update actual values that get used.
        angular.extend(CK_API_KEYS, newVal);
        $scope.auth_ok = false;

        // Fetch/refetch accounts list to prove keys work.
        Restangular.one('v1/my/accounts').get().then(function(d) {
            var accounts = d.results;

            console.log("Got the account list ok: " + accounts.length + ' accounts');

            // update display (check vs. X)
            $scope.auth_ok = true;

            // tell rest of system about new state
            $rootScope.$broadcast('new_account_list', accounts);
        });
    });
});

/*
app.factory('myInterceptor', ['$log', function($log)
{
    // This code is purely for debug, and somewhat annoying....

    var myInterceptor = {
       'request': function(config) {
            $log.debug("HTTP Request: " + config.url, config);

            return config;
        },

        'response': function(response) {
            //$log.debug("HTTP Response: ", response);
            return response;
        },

        'responseError': function(response) {
            // This allows my carefully constructed JSON error
            // responses to show through!
            $log.debug("HTTP Response (Error): ", response);
            if(!response.data) {
                response.data = '{"error":"HTTP Error ' + response.status + '"}';
            }
            return response;
        }
    };

    return myInterceptor;
}]);

app.config(['$httpProvider', function($httpProvider) {
    $httpProvider.interceptors.push('myInterceptor');
}]);
*/


app.config(function(RestangularProvider) {

    RestangularProvider.setBaseUrl(CK_API_HOST);

    RestangularProvider.setFullRequestInterceptor(function(element, operation, route, url, headers, params, httpConfig) {

        if(route[0] != '/') {
            // our resources start with slash, but Restangular wants them without, so add
            // back in here.
            route = '/' + route;
        }

        console.log("Full request: ", headers, url, route);

        _.extend(headers, get_auth_headers(route));

      return {
        element: element,
        params: params,
        headers: headers,
        httpConfig: httpConfig
      };
    });

    RestangularProvider.addResponseInterceptor(function(data, operation, what, url, response, deferred) {
        if(response.status != 200) {
            console.error("CK Request failed: " + response.status);
            console.error("JSON contents: ", data);
        }
        //console.log("respon interceptro: data=", data, " response=", response);

      return data;
    });

    RestangularProvider.setErrorInterceptor(function(response, deferred, responseHandler) {
        if(response.status != 200) {
              console.log("API ERROR", response);

        }

        return true; // error not handled
    });


});

// CK Authorization stuff
//
function get_auth_headers(endpoint) {
    if(!CK_API_KEYS.api_secret || !CK_API_KEYS.api_key) {
        console.warn("No API key/secret defined but continuing w/o authorization headers.")
        return {};
    }

    // make the tricky parts of the auth headers
    return CK_API.auth_headers(CK_API_KEYS.api_key, CK_API_KEYS.api_secret, endpoint);
}

// EOF

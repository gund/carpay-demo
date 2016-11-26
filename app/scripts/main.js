/*!
 *
 *  Web Starter Kit
 *  Copyright 2015 Google Inc. All rights reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License
 *
 */
/* eslint-env browser */

(function () {
  'use strict';

  // Check to make sure service workers are supported in the current browser,
  // and that the current page is accessed from a secure origin. Using a
  // service worker from an insecure origin will trigger JS console errors. See
  // http://www.chromium.org/Home/chromium-security/prefer-secure-origins-for-powerful-new-features
  var isLocalhost = Boolean(window.location.hostname === 'localhost' ||
    // [::1] is the IPv6 localhost address.
    window.location.hostname === '[::1]' ||
    // 127.0.0.1/8 is considered localhost for IPv4.
    window.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
    )
  );

  if ('serviceWorker' in navigator &&
    (window.location.protocol === 'https:' || isLocalhost)) {
    navigator.serviceWorker.register('service-worker.js')
      .then(function (registration) {
        // updatefound is fired if service-worker.js changes.
        registration.onupdatefound = function () {
          // updatefound is also fired the very first time the SW is installed,
          // and there's no need to prompt for a reload at that point.
          // So check here to see if the page is already controlled,
          // i.e. whether there's an existing service worker.
          if (navigator.serviceWorker.controller) {
            // The updatefound event implies that registration.installing is set:
            // https://slightlyoff.github.io/ServiceWorker/spec/service_worker/index.html#service-worker-container-updatefound-event
            var installingWorker = registration.installing;

            installingWorker.onstatechange = function () {
              switch (installingWorker.state) {
                case 'installed':
                  // At this point, the old content will have been purged and the
                  // fresh content will have been added to the cache.
                  // It's the perfect time to display a "New content is
                  // available; please refresh." message in the page's interface.
                  break;

                case 'redundant':
                  throw new Error('The installing ' +
                    'service worker became redundant.');

                default:
                // Ignore
              }
            };
          }
        };
      }).catch(function (e) {
      console.error('Error during service worker registration:', e);
    });
  }

  class Camera {
    constructor(container) {
      this.camera = Webcam.attach(container);

      this.onLive = new Promise(res => Webcam.on('live', () => res()));
    }

    snap() {
      return new Promise((res, rej) => {
        try {
          Webcam.snap(data => res(data));
        } catch (e) {
          rej(e);
        }
      });
    }
  }

  class Vision {
    static get Endpoint() {
      return {
        Recognize: 'https://visual-recognition-hack.eu-gb.mybluemix.net/api/classify'
      };
    };

    static recognize(imgData) {
      // Mock Vision
      // return new Promise(res => res({images_processed: 1, images: [{text: 'dubaiP18159', words: [{word: 'dubaiP18159'}]}]}));

      const form = new FormData();
      form.append('image_data', imgData);

      const conf = {
        method: 'POST',
        body: form
      };

      return fetch(Vision.Endpoint.Recognize, conf)
        .then(res => res.json());
    }

    static analyzeData(data) {
      return new Promise((res, rej) => {
        if (data.images_processed === 0) {
          return rej('Image was not processed');
        }

        const img = data.images[0];

        if (!img.text || !img.words || !img.words.length) {
          return rej('Car plate was not recognized');
        }

        res(img.words.map(w => w.word).join(''));
      });
    }
  }

  class CarPayApi {
    static get Endpoint() {
      return {
        Validate: 'https://slava.skillserver.net/index/validateCarPlate/',
        Payment: 'https://slava.skillserver.net/index/requestPayment/'
      };
    }

    static validateCarPlate(plate, entityName) {
      return fetch(CarPayApi.Endpoint.Validate + `${plate}/${entityName}`)
        .then(res => res.text())
        .then(res => new Promise(r => setTimeout(() => r(res), 1000)));
    }

    static requestPayment(plate, amount, entityName) {
      return fetch(CarPayApi.Endpoint.Payment + `${plate}/${amount}/${entityName}`)
        .then(res => res.text())
        .then(res => new Promise(r => setTimeout(() => r(res), 2000)));
    }
  }

  class GasApp {
    static get State() {
      return {
        Idle: 0,
        CarCaptured: 1,
        RecognizingPlate: 8,
        PlateFound: 2,
        PlateNotFound: 3,
        WaitingForMeter: 4,
        WaitingForPayment: 5,
        PaymentSuccessful: 6,
        PaymentFailed: 7
      };
    }

    static get Name() {
      return 'ENOC Gas Station #4';
    }

    constructor() {
      this.camera = new Camera('#camera-cnt');

      this.init();

      this.updateGasLiters$.subscribe(l => this.gasLiters.textContent = l);
      this.updateGasPrice$.subscribe(p => this.gasPrice.textContent = p);
      this.updateGasProgress.subscribe(v => this.gasProgress.value = v);

      this.cycle$.subscribe(() => setTimeout(() => this.resetStation$.next(), 3000));
      this.capturedImage$.subscribe(() => console.log('Image captured'));

      this.error$.subscribe(alert);
      this.status$.subscribe(s => console.log('[status]', s));
      this.carPlate$.subscribe(p => {
        this.updateGasCar$.next(p);
        console.log('Cart Plate:', p);
      });

      this.updateGasCar$.subscribe(p => this.gasCar.textContent = p);

      this.status$.subscribe(s => {
        switch (s) {
          case GasApp.State.RecognizingPlate:
          case GasApp.State.WaitingForPayment:
            this.updateCamStatue('waiting yellow');
            break;
          case GasApp.State.PlateFound:
          case GasApp.State.WaitingForMeter:
            this.updateCamStatue('static yellow');
            break;
          case GasApp.State.PaymentSuccessful:
            this.updateCamStatue('static green');
            break;
          case GasApp.State.PaymentFailed:
            this.updateCamStatue('static red');
            break;
          default:
            this.updateCamStatue('');
            break;
        }
      });
    }

    init() {
      this.camLive$ = Rx.Observable.fromPromise(this.camera.onLive);
      this.ready$ = Rx.Observable.merge(this.camLive$);

      this.cameraStatus = document.querySelector('#camera-status');

      this.fillBtn = document.querySelector('#gas-fill');
      this.fill$ = Rx.Observable.fromEvent(this.fillBtn, 'click');

      this.gasLiters = document.querySelector('#gas-liters');
      this.updateGasLiters$ = new Rx.BehaviorSubject(0);

      this.gasPrice = document.querySelector('#gas-price');
      this.updateGasPrice$ = new Rx.BehaviorSubject(0);

      this.gasCar = document.querySelector('#gas-car');
      this.updateGasCar$ = new Rx.BehaviorSubject('N/A');

      this.gasProgress = document.querySelector('#gas-progress');
      this.updateGasProgress = new Rx.BehaviorSubject(0);

      this.resetStation$ = new Rx.Subject();

      this.error$ = new Rx.Subject();

      this.capturedImage$ = new Rx.BehaviorSubject(null);

      this.status$ = new Rx.BehaviorSubject(GasApp.State.Idle);

      this.carPlate$ = new Rx.BehaviorSubject(null);

      this.meter$ = this.fill$
        .do(() => this.status$.next(GasApp.State.WaitingForMeter))
        .switchMap(() => this.fillMeter())
        .do(liters => {
          this.updateGasProgress.next(liters);
          this.updateGasLiters$.next(liters);
        })
        .map(liters => liters * 0.32)
        .do(price => this.updateGasPrice$.next(price));

      this.cycle$ = this.resetStation$.merge(this.ready$)
      // .switchMap(() => Rx.Observable.interval(5000).takeUntil(this.resetStation$))
        .do(() => {
          this.updateGasCar$.next('N/A');
          this.status$.next(GasApp.State.Idle);
        })
        .switchMap(() => Rx.Observable.fromPromise(this.camera.snap())
          .takeUntil(this.resetStation$)
          .catch(e => this.handleError('Failed to take a picture')))
        .do(img => this.capturedImage$.next(img))
        .switchMap(img => Rx.Observable.fromPromise(Vision.recognize(img))
          .takeUntil(this.resetStation$)
          .catch(e => this.handleError('Failed to recognize image')))
        .switchMap(data => Rx.Observable.fromPromise(Vision.analyzeData(data))
          .catch(e => this.handleError(e)))
        .do(() => this.status$.next(GasApp.State.RecognizingPlate))
        .switchMap(plate => Rx.Observable.fromPromise(CarPayApi.validateCarPlate(plate, GasApp.Name))
          .takeUntil(this.resetStation$)
          .map(() => plate)
          .do(null, () => this.status$.next(GasApp.State.PlateNotFound))
          .catch(e => this.handleError('Car Plate is not registered')))
        .do(() => this.status$.next(GasApp.State.PlateFound))
        .do(plate => this.carPlate$.next(plate))
        .do(() => this.status$.next(GasApp.State.WaitingForMeter))
        .merge(this.meter$.debounceTime(100))
        .filter(v => typeof v === 'number')
        .do(() => this.status$.next(GasApp.State.WaitingForPayment))
        .switchMap(meter =>
          Rx.Observable.fromPromise(CarPayApi.requestPayment(this.carPlate$.getValue(), meter, GasApp.Name))
            .takeUntil(this.resetStation$)
            .do(null, () => this.status$.next(GasApp.State.PaymentFailed))
            .catch(e => this.handleError('Payment failed')))
        .do(() => this.status$.next(GasApp.State.PaymentSuccessful));
    }

    fillMeter() {
      return new Rx.Observable.range(0, 100);
    }

    updateCamStatue(status) {
      this.cameraStatus.className = `camera-status ${status}`;
    }

    handleError(e) {
      console.error(e);
      // this.error$.next(e);
      setTimeout(() => this.resetStation$.next(), 2000);
      return Rx.Observable.empty();
    }
  }

  new GasApp();
})();

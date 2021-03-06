// OpenPGP.js - An OpenPGP implementation in javascript
// Copyright (C) 2018 Proton Technologies AG
//
// This library is free software; you can redistribute it and/or
// modify it under the terms of the GNU Lesser General Public
// License as published by the Free Software Foundation; either
// version 3.0 of the License, or (at your option) any later version.
//
// This library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public
// License along with this library; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA

// Algorithms for probabilistic random prime generation

/**
 * @requires bn.js
 * @requires crypto/random
 * @module crypto/public_key/prime
 */

import BN from 'bn.js';
import random from '../random';

export default {
  randomProbablePrime, isProbablePrime, fermat, millerRabin
};

/**
 * Probabilistic random number generator
 * @param {Integer} bits Bit length of the prime
 * @param {BN}      e    Optional RSA exponent to check against the prime
 * @param {Integer} k    Optional number of iterations of Miller-Rabin test
 * @return BN
 */
function randomProbablePrime(bits, e, k) {
  const min = new BN(1).shln(bits - 1);

  let n = random.getRandomBN(min, min.shln(1));
  if (n.isEven()) {
    n.iaddn(1); // force odd
  }

  while (!isProbablePrime(n, e, k)) {
    n.iaddn(2);
    // If reached the maximum, go back to the minimum.
    if (n.bitLength() > bits) {
      n = n.mod(min.shln(1)).iadd(min);
    }
  }
  return n;
}

/**
 * Probabilistic primality testing
 * @param {BN}      n Number to test
 * @param {BN}      e Optional RSA exponent to check against the prime
 * @param {Integer} k Optional number of iterations of Miller-Rabin test
 * @return {boolean}
 */
function isProbablePrime(n, e, k) {
  if (e && !n.subn(1).gcd(e).eqn(1)) {
    return false;
  }
  if (!fermat(n)) {
    return false;
  }
  if (!millerRabin(n, k, () => new BN(lowprimes[Math.random() * lowprimes.length | 0]))) {
    return false;
  }
  if (!millerRabin(n, k)) {
    return false;
  }
  // TODO implement the Lucas test
  // See Section C.3.3 here: https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-4.pdf
  return true;
}

/**
 * Tests whether n is probably prime or not using Fermat's test with b = 2.
 * Fails if b^(n-1) mod n === 1.
 * @param {BN}      n Number to test
 * @param {Integer} b Optional Fermat test base
 * @return {boolean}
 */
function fermat(n, b) {
  b = b || new BN(2);
  return b.toRed(BN.mont(n)).redPow(n.subn(1)).fromRed().cmpn(1) === 0;
}

const lowprimes = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
  73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173,
  179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281,
  283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409,
  419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541,
  547, 557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659,
  661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809,
  811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941,
  947, 953, 967, 971, 977, 983, 991, 997];


// Miller-Rabin - Miller Rabin algorithm for primality test
// Copyright Fedor Indutny, 2014.
//
// This software is licensed under the MIT License.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// Adapted on Jan 2018 from version 4.0.1 at https://github.com/indutny/miller-rabin

/**
 * Tests whether n is probably prime or not using the Miller-Rabin test.
 * See HAC Remark 4.28.
 * @param {BN}       n    Number to test
 * @param {Integer}  k    Optional number of iterations of Miller-Rabin test
 * @param {Function} rand Optional function to generate potential witnesses
 * @return {boolean}
 */
function millerRabin(n, k, rand) {
  const len = n.bitLength();
  const red = BN.mont(n);
  const rone = new BN(1).toRed(red);

  if (!k)
    k = Math.max(1, (len / 48) | 0);

  const n1 = n.subn(1);
  const rn1 = n1.toRed(red);

  // Find d and s, (n - 1) = (2 ^ s) * d;
  let s = 0;
  while (!n1.testn(s)) { s++; }
  const d = n.shrn(s);

  for (; k > 0; k--) {
    let a = rand ? rand() : random.getRandomBN(new BN(2), n1);

    let x = a.toRed(red).redPow(d);
    if (x.eq(rone) || x.eq(rn1))
      continue;

    let i;
    for (i = 1; i < s; i++) {
      x = x.redSqr();

      if (x.eq(rone))
        return false;
      if (x.eq(rn1))
        break;
    }

    if (i === s)
      return false;
  }

  return true;
};

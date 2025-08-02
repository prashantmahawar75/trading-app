"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TICKER = exports.app = void 0;
var express = require("express");
// import express from "express";
var body_parser_1 = require("body-parser");
var path = require("path");
exports.app = express();
exports.app.use((0, body_parser_1.default)({}));
exports.app.use(body_parser_1.default.json());
exports.app.use(express.static(path.join(__dirname, 'public'))); // Serve static files
// ... (keep all your existing interface and route code)
// Add this route to serve the frontend HTML
exports.app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
;
exports.TICKER = "GOOGLE"; // jo stock trade ho raha hai , it can be array containing multiple string  for diffrent complnay
// intial balance hai user ka
var users = [{
        id: "1",
        balances: {
            "GOOGLE": 10,
            "USD": 50000
        }
    }, {
        id: "2",
        balances: {
            "GOOGLE": 10,
            "USD": 50000
        }
    }];
// part of order book that are stored in memory to reduce latency not in any sort of database taki lane dalne ka time bache kyuki second mai value badal rahai hai
var bids = []; // buy  type- price - qty
var asks = []; // sell ka hai 
// Place a limit order
exports.app.post("/order", function (req, res) {
    var side = req.body.side; // buy ye sell 
    var price = req.body.price; // the price at which the user want to buyor sell
    var quantity = req.body.quantity; // qty for buy and sell
    var userId = req.body.userId; // user id of the user who is placing the order
    // no security check is done here, in real world you will have to check if user has enough balance to place the ordeer from the cookie 
    // can i fill order at this price
    var remainingQty = fillOrders(side, price, quantity, userId); // after filling jitna bhi mil raha hai
    // fillOrders will return the remaining quantity that could not be filed and are left int he order book 
    if (remainingQty === 0) {
        res.json({ filledQuantity: quantity }); // ye btaega trader ko ki apka itna order abhi full fil  nahi hua
        return;
    }
    if (side === "bid") { // bid lagi hai buy kar raha hai 
        bids.push({
            userId: userId,
            price: price,
            quantity: remainingQty
        });
        bids.sort(function (a, b) { return a.price < b.price ? -1 : 1; }); // sort kar diya taki highest bid pehle aaye
    }
    else {
        asks.push({
            userId: userId,
            price: price,
            quantity: remainingQty
        });
        // asks.sort((a, b) => a.price < b.price ? -1 : 1); galat sort hai 
        asks.sort(function (a, b) { return a.price < b.price ? 1 : -1; }); // sahi sort ab jo search hoga pehle kam ki bid dhundega order fill  karne ke liye
    }
    res.json({
        filledQuantity: quantity - remainingQty, // ye btaega trader ko ki apka itna order abhi full fil  hua
    });
});
// depth end point will return the current order book depth
exports.app.get("/depth", function (req, res) {
    var depth = {}; // empty order book depth
    for (var i = 0; i < bids.length; i++) { // iterate over all the bids
        if (!depth[bids[i].price]) { // if this price is not already in the depth
            depth[bids[i].price] = {
                quantity: bids[i].quantity,
                type: "bid"
            };
        }
        else { // agar price pehle se hi hahi to bass ki qty bhada do
            depth[bids[i].price].quantity += bids[i].quantity;
        }
    }
    // same with asks
    // iterate over all the asks
    for (var i = 0; i < asks.length; i++) { // for each ask
        // if this price is not already in the depth
        if (!depth[asks[i].price]) {
            depth[asks[i].price] = {
                quantity: asks[i].quantity,
                type: "ask"
            };
        }
        else { // agar price pehle se hi hahi to bass ki qty bhada do
            depth[asks[i].price].quantity += asks[i].quantity;
        }
    }
    res.json({
        depth: depth
    });
});
exports.app.get("/balance/:userId", function (req, res) {
    var _a;
    // userId is passed as a parameter in the URL
    var userId = req.params.userId; // get the userId from the request parameters
    var user = users.find(function (x) { return x.id === userId; }); // find karega ki pehle se koi user mil jaye 
    if (!user) { // agra nahi mile to zero se value intiale sa karega
        return res.json((_a = {
                USD: 0
            },
            _a[exports.TICKER] = 0 // user ke paas kitne stock hai wo bhi 0
        ,
            _a));
    }
    res.json({ balances: user.balances });
});
// app.get("/quote", (req, res) => {
//   // TODO: Assignment
// });
exports.app.get("/quote", function (req, res) {
    // The best bid is the highest price a buyer is willing to pay.
    // Since the `bids` array is sorted in ascending order (lowest to highest price),
    // the best bid is the last element in the array.
    var bestBid = bids.length > 0 ? bids[bids.length - 1].price : null;
    // The best ask is the lowest price a seller is willing to accept.
    // Since the `asks` array is sorted in descending order (highest to lowest price),
    // the best ask is the last element in the array.
    var bestAsk = asks.length > 0 ? asks[asks.length - 1].price : null;
    res.json({
        ticker: exports.TICKER,
        bestBid: bestBid,
        bestAsk: bestAsk
    });
});
// user1 bechne wala hai aur user 2 kharidne wala hai
// user1 ke pass stock hai aur user2 ke pass paise hai
function flipBalance(userId1, userId2, quantity, price) {
    var user1 = users.find(function (x) { return x.id === userId1; });
    var user2 = users.find(function (x) { return x.id === userId2; });
    if (!user1 || !user2) {
        return;
    }
    user1.balances[exports.TICKER] -= quantity; // seller ki itnin qty kam kar do 
    user2.balances[exports.TICKER] += quantity; // buyer ki itni qty bhada do
    user1.balances["USD"] += (quantity * price); // seller kejitni qty thi uske hissab se paise dekhar badhda do
    user2.balances["USD"] -= (quantity * price); // buyer ke mai vitne hi paise kam kar do
}
// incomming order ko bharne ke liye 
// ye function will try to fill the order with the existing orders in the order book    
//                    
function fillOrders(side, price, quantity, userId) {
    var remainingQuantity = quantity;
    if (side === "bid") { // bid matlab buy kar raha hai   -- huyer ki taraf se 
        // if the order is a bid, we will look for asks that are less than or equal to the price
        // iterate over the asks in reverse order to fill the order
        for (var i = asks.length - 1; i >= 0; i--) {
            if (asks[i].price > price) {
                continue; // jyda mang rahage to loop mai continue karega
            }
            // koi value mil gayi hai jo price se kam hai
            // now we will try to fill the order with this ask
            if (asks[i].quantity > remainingQuantity) {
                asks[i].quantity -= remainingQuantity;
                flipBalance(asks[i].userId, userId, remainingQuantity, asks[i].price); // seller ke pass paise a jayenge jo buyer ke the aur buyer ke pass stocks a jaynga jo seller ka tha
                // trade completed                                     yaha par ask .price aya price nahi kyuki ho sakta hai ki buy dalo ho jis rate par usse bhi kam mai koi sell kar raha ho to vo buy order pehle vo sell wala oreder pura karega jo kam daam par hai
                return 0;
            }
            else { // agar but ki demand jyada hai aur vitne order mai us paise par nahi hai to remaining qty mai jitna order pura hua jo minus kro aur fir usse ask mai se pop karo
                remainingQuantity -= asks[i].quantity; // remaining qty kam ho gaye ji kyki partial order fill hi hua hai pura nahi 
                // aur joo ask tha use index par vo hata diya jaeyga 
                flipBalance(asks[i].userId, userId, asks[i].quantity, asks[i].price);
                asks.pop(); // compltere sell order aur partial/ fill (=) order hoga
            }
        }
    }
    else { // --seller ki taraf se 
        // if the order is an ask, we will look for bids that are greater than or equal to the price
        // iterate over the bids in reverse order to fill the order
        for (var i = bids.length - 1; i >= 0; i--) {
            if (bids[i].price < price) {
                continue;
            }
            if (bids[i].quantity > remainingQuantity) {
                bids[i].quantity -= remainingQuantity;
                flipBalance(userId, bids[i].userId, remainingQuantity, price);
                return 0;
            }
            else {
                remainingQuantity -= bids[i].quantity;
                flipBalance(userId, bids[i].userId, bids[i].quantity, price);
                bids.pop();
            }
        }
    }
    return remainingQuantity;
}

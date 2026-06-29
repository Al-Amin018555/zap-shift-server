const express = require('express');
const app = express();
require('dotenv').config()
var cors = require('cors');
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRECT);
const crypto = require('crypto');

const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
``
const serviceAccount = require("./zap-shift-firebase-adminsdk.json");

admin.initializeApp({
    credential: admin.cert(serviceAccount),
});


function generateTrackingId() {
    const date = new Date();

    const datePart =
        String(date.getFullYear()).slice(-2) +
        String(date.getMonth() + 1).padStart(2, '0') +
        String(date.getDate()).padStart(2, '0');

    const randomPart = crypto
        .randomBytes(3)
        .toString('hex')
        .toUpperCase();

    return `PCL${datePart}${randomPart}`;
}


//middleware
app.use(express.json())
app.use(cors());

const verifyFBToken = async (req, res, next) => {

    const token = req.headers.authorization;
    console.log(token);

    if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
    }

    try {
        const idToken = token.split(' ')[1];
        const decoded = await getAuth().verifyIdToken(idToken);
        console.log("decoded in the token", decoded);
        req.decoded_email = decoded.email;
        next()
    }
    catch (err) {
        return res.status(401).send({ message: "unauthorized access" })
    }

}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.q3bebek.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const db = client.db("zap_shift_db");
        const usersCollection = db.collection("users");
        const parcelsCollection = db.collection("parcels");
        const paymentCollection = db.collection("payments");
        const ridersCollection = db.collection("riders");

        // users related apis
        app.get('/users', verifyFBToken, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result)
        })

        app.post('/users', async (req, res) => {

            const user = req.body;
            user.role = 'user',
                user.createdAt = new Date();
            const email = user.email;

            const userExists = await usersCollection.findOne({ email });
            if (userExists) {
                return res.send({ message: "user already exist" });
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);

        })
        app.patch('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const roleInfo = req.body;
            const updatedDoc = {
                $set: {
                    role: roleInfo.role
                }
            }

            const result = await usersCollection.updateOne(query,updatedDoc);
            res.send(result)
        })

        // parcel's api's
        app.get('/parcels', async (req, res) => {
            const query = {};
            const { email } = req.query

            if (email) {
                query.senderEmail = email;
            }
            const options = { sort: { createdAt: -1 } }

            const parcels = await parcelsCollection.find(query, options).toArray();
            res.send(parcels);
        })

        app.get('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = new ObjectId(id);

            const result = await parcelsCollection.findOne(query);
            res.send(result);
        })

        app.post('/parcels', async (req, res) => {
            const parcel = req.body;
            parcel.createdAt = new Date();
            const result = await parcelsCollection.insertOne(parcel);
            res.send(result)
        })

        app.delete('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await parcelsCollection.deleteOne(query);
            res.send(result); ``

        })

        //payment realted api's

        // app.post('/payment-checkout-session', async (req, res) => {
        //     const paymentInfo = req.body;
        //     const amount = parseInt(paymentInfo.cost) * 100;
        //     const session = await stripe.checkout.sessions.create({
        //         line_items: [
        //             {
        //                 price_data: {
        //                     currency: 'usd',
        //                     unit_amount: amount,
        //                     product_data: {
        //                         name: paymentInfo.name,

        //                     },
        //                 },
        //                 quantity: 1,
        //             },
        //         ],
        //         mode: 'payment',
        //         customer_email: paymentInfo.senderEmail,
        //         metadata: {
        //             parcelId: paymentInfo.parcelId,
        //         },
        //         success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        //         cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        //     });
        //     console.log(session);
        //     res.send({ url: session.url })
        // });

        app.post('/create-checkout-session', async (req, res) => {

            const paymentInfo = req.body;

            const amount = parseInt(paymentInfo.cost) * 100;
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {

                        price_data: {
                            currency: 'USD',
                            unit_amount: amount,
                            product_data: {
                                name: paymentInfo.parcelName,
                            }
                        },
                        quantity: 1,
                    },
                ],
                customer_email: paymentInfo.senderEmail,
                mode: 'payment',
                metadata: {
                    parcelId: paymentInfo.parcelId,
                    parcelName: paymentInfo.parcelName,
                },
                success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
            });
            console.log(session);
            res.send({ url: session.url });
        })

        app.patch('/payment-success', async (req, res) => {
            const sessionId = req.query.session_id;
            console.log("session id: ", sessionId);

            const session = await stripe.checkout.sessions.retrieve(sessionId);
            console.log("session retrive", session);

            const transactionId = session.payment_intent
            const query = { transactionId: transactionId }

            const paymentIsExist = await paymentCollection.findOne(query);

            if (paymentIsExist) {
                return res.send({ message: "you have already paid for this", transactionId, trackingId: paymentIsExist.trackingId })
            }

            const trackingId = generateTrackingId();

            if (session.payment_status === "paid") {
                const id = session.metadata.parcelId;
                const query = { _id: new ObjectId(id) };

                const update = {
                    $set: {
                        paymentStatus: "paid",
                        trackingId: trackingId,
                    }
                };

                const result = await parcelsCollection.updateOne(query, update);

                const payment = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    customerEmail: session.customer_email,
                    parcelId: session.metadata.parcelId,
                    parcelName: session.metadata.parcelName,
                    transactionId: session.payment_intent,
                    paymentStatus: session.payment_status,
                    paidAt: new Date(),
                    trackingId: trackingId,

                }
                if (session.payment_status === "paid") {
                    const resultPayment = await paymentCollection.insertOne(payment);
                    res.send({
                        success: true,
                        modifyParcel: result,
                        trackingId: trackingId,
                        transactionId: session.payment_intent,
                        paymentInfo: resultPayment
                    })
                }

            }
            res.send({ success: false })

        })

        app.get('/payments', verifyFBToken, async (req, res) => {
            const email = req.query.email;

            const query = {};

            if (email) {
                query.customerEmail = email;

                //check email address
                if (email !== req.decoded_email) {
                    return res.status(403).send({ message: "forbidden access" })
                }
            }

            const result = await paymentCollection.find(query).sort({ paidAt: -1 }).toArray();
            res.send(result);
        })

        // riders related apis

        app.get('/riders', async (req, res) => {
            const status = req.query.status;
            const query = {};

            if (status) {
                query.status = status;
            }

            const result = await ridersCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/riders', async (req, res) => {
            const rider = req.body;
            rider.status = "pending",
                rider.createdAt = new Date();

            const result = await ridersCollection.insertOne(rider);
            res.send(result)

        })

        app.patch('/riders/:id', verifyFBToken, async (req, res) => {
            const status = req.body.status;
            const id = req.params.id;

            const query = { _id: new ObjectId(id) };

            const updatedDoc = {
                $set: {
                    status: status,
                }
            }
            const result = await ridersCollection.updateOne(query, updatedDoc)

            if (status === "approved") {
                const email = req.body.email;
                console.log(email);
                const userQuery = { email };
                const updatedDoc = {
                    $set: {
                        role: "rider",
                    }
                }
                const result = await usersCollection.updateOne(userQuery, updatedDoc);
            }

            res.send(result)
        })

        app.delete('/riders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await ridersCollection.deleteOne(query);
            res.send(result);
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Zap is shifting shfiting!');
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
}); 
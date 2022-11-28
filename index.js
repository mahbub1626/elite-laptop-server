const express = require('express');
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();

// middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.3sh2wxl.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


// jwt verify opt()middleware
function verifyJWT(req, res, next) {
    console.log('token inside VerifyJWT', req.headers.authorization);
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next()

    })

}


async function run() {
    try {
        const laptopsCategoriesCollection = client.db('eliteLaptop').collection('categories');
        const laptopsCollection = client.db('eliteLaptop').collection('laptops');
        const usersCollection = client.db('eliteLaptop').collection('users');
        const purchasesCollection = client.db('eliteLaptop').collection('purchases');
        const paymentsCollection = client.db('eliteLaptop').collection('payments');



        // laptop categories    
        app.get('/categories', async (req, res) => {
            const query = {};
            const categories = await laptopsCategoriesCollection.find(query).toArray();
            res.send(categories);
        })

        // jwt api
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        })


        // get buyer
        app.get('/users/buyer/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isBuyer: user?.userType === 'buyer' });
        })

        // get users 
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        })

        // create users
        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user)
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });
        // delete user

        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })

        app.put('/users/admin/:id', verifyJWT, async (req, res) => {
            // jwt verify
            //    see admin function
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            // // end

            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        // post a laptop
        app.post('/laptops', verifyJWT, async (req, res) => {
            const laptop = req.body;
            const result = await laptopsCollection.insertOne(laptop);
            res.send(result);
        })

        app.get('/laptops', async (req, res) => {
            const query = {};
            const laptops = await laptopsCollection.find(query).toArray();
            res.send(laptops);
        })
        // get uniq category by _id
        app.get('/laptops/:id', async (req, res) => {
            const id = req.params.id;
            // const query = {categoryId:}
            const query = { _id: ObjectId(id) }
            console.log(id, query);

            const categoryLaptop = await laptopsCollection.findOne(query)
            res.send(categoryLaptop);
        })

        // get uniq category by categoryId
        app.get('/category/:id', async (req, res) => {
            const id = req.params.id;
            const query = { categoryId: id }
            const categoryLaptop = await laptopsCollection.find(query).toArray()
            res.send(categoryLaptop);
        })

        app.get('/purchases/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const purchase = await purchasesCollection.findOne(query);
            res.send(purchase);
        })

        // payment
        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const resellPrice = booking.resellPrice;
            const amount = resellPrice * 1000;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })
        // post and update payment data
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.bookingId
            const filter = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await purchasesCollection.updateOne(filter, updateDoc);
            res.send(result)
        })


        // post puscheses laptops
        app.post('/purchases', async (req, res) => {
            const purchase = req.body;
            console.log(purchase);

            // find booked appointment , if booked return message "You already have a booking on 'date' "
            // cheack
            // const query = {
            //     appointment: booking.appointment,
            //     email: booking.email,
            //     treatment: booking.treatment

            // }

            // const alreadyBooked = await bookingsCollection.find(query).toArray();

            // if (alreadyBooked.length) {
            //     const message = `You already have a booking on ${booking.appointment}`
            //     return res.send({ acknowledged: false, message })
            // }
            // end

            const result = await purchasesCollection.insertOne(purchase);
            res.send(result);
        });


        // get purchase        
        app.get('/purchases', verifyJWT, async (req, res) => {
            const email = req.query.email;
            console.log('token', req.headers.authorization);
            const decodedEmail = req.decoded.email;
            console.log(email, decodedEmail)
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email }
            const purchase = await purchasesCollection.find(query).toArray()
            res.send(purchase)
        })
    }
    finally {

    }
}
run().catch(console.dir);


app.get('/', async (req, res) => {
    res.send('Elite Laptop portal server is running')
})

app.listen(port, () => console.log(`Elite Laptop portal running on ${port}`))
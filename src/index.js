require('dotenv').config();
const express = require('express');
const db = require('./config/db');

const app = express();
const port = process.env.PORT || 3000;
// Middleware per parsing JSON
app.use(express.json());

// Endpoint per ottenere la lista utenti
app.get('/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users');
    res.json(rows);
  } catch (error) {
    console.error('Errore durante l\'esecuzione della query:', error);
    res.status(500).send('Errore del server');
  }
});



// Endpoint per ottenere la lista dei prodotti di un singolo carrello
app.get('/cart/:id', async (req, res) => {

   const id = req.params.id; // Ottieni l'ID dai parametri della route

  try {
    const [rows] = await db.query(`SELECT * FROM carts_products WHERE carts_id = ${id};`);
    res.json(rows);
  } catch (error) {
    console.error('Errore durante l\'esecuzione della query:', error);
    res.status(500).send('Errore del server');
  }
});




// Endpoint per aggiungere un proditto
app.post('/product', async (req, res) => {
  // Estrai i dati dal corpo della richiesta
  const { name, description, price, quantity_available } = req.body;

  // Verifica che tutti i campi richiesti siano forniti
  if (!name || !description || !price || !quantity_available) {
    return res.status(400).send('All fields (name, description, price, quantity_available) are necessary');
  }
  try {
    // Esegui l'insert nella tabella products
    const query = `
      INSERT INTO products (name, description, price, quantity_available, date_registration) 
      VALUES (?, ?, ?, ?, NOW())
    `;
    const result = await db.query(query, [name, description, price, quantity_available]);

    // Rispondi con l'ID del nuovo prodotto inserito
    res.status(201).json({ message: 'Prodotto aggiunto con successo', productId: result.insertId });
  } catch (error) {
    console.error('Errore durante l\'inserimento del prodotto:', error);
    res.status(500).send('Errore del server');
  }
});


// Endpoint per aggiungere un proditto al carrello
app.post('/productToCart', async (req, res) => {

  // Estrai i dati dal corpo della richiesta
   const {cartId, productId, productQuantity} = req.body;
   // Verifica che tutti i campi richiesti siano forniti
   if (!cartId || !productId || !productQuantity) {
     return res.status(400).send('All fields (idProduct, quantity) are necessary');
   }


  try {
    // Controlla se il prodotto esiste già nel carrello
    const rows = await db.query(
      'SELECT quantity FROM carts_products WHERE carts_id = ? AND products_id = ?',
      [cartId, productId]
    );

    
    if (rows.length === 0) {

      // Il prodotto non esiste, aggiungilo al carrello
      const result = await db.query(
        'INSERT INTO carts_products (carts_id, products_id, quantity) VALUES (?, ?, ?)',
        [cartId, productId, productQuantity]
      );
      res.status(201).json({ message: 'Prodotto aggiunto al carrello con successo' });

    } else {
      // Il prodotto esiste, aggiorna la quantità
      const resultUpdate = await db.query(
        'UPDATE carts_products SET quantity = quantity + ? WHERE carts_id = ? AND products_id = ?',
        [productQuantity, cartId, productId]
      );
            res.status(201).json({ message: 'Prodotto già esistente nel carrello, quantità aggiornata con successo' });

    }

    console.log('Operazione completata con successo.');
  } catch (error) {
    console.error('Errore durante l\'operazione:', error);
    res.status(500).send('Errore del server');

  }
});//MANCA IL TEST


// Endpoint per rimuovere un prodotto dal carrello
app.post('/cart/remove', async (req, res) => {
  const { cartId, productId, quantity } = req.body;

  // Controllo dei parametri
  if (!productId || !cartId) {
    return res.status(400).send('È richiesto il parametro productId e il parametro cartId.');
  }

  try {
    if (quantity) {
      // Riduzione della quantità specificata
      const updateQuery = `
        UPDATE carts_products 
        SET quantity = quantity - ? 
        WHERE products_id = ? AND carts_id = ? AND quantity > ?
      `;
      const updateResult = await db.query(updateQuery, [quantity, productId, cartId, quantity]);

      if (updateResult.affectedRows === 0) {
//        return res.status(400).send('Impossibile ridurre la quantità. Il prodotto potrebbe non essere presente nel carrello o la quantità è insufficiente.');
      

      // Rimuovi il prodotto se la quantità diventa zero
      const deleteQuery = `
        DELETE FROM carts_products 
        WHERE products_id = ? AND carts_id = ?
      `;
      await db.query(deleteQuery, [productId, cartId]);

      }

      return res.status(200).json({ message: 'Quantità del prodotto aggiornata con successo.' });

    } else {
      // Rimozione completa del prodotto
      const deleteQuery = `
        DELETE FROM carts_products 
        WHERE products_id = ? AND carts_id = ?      
        `;
      const deleteResult = await db.query(deleteQuery, [productId, cartId]);

      if (deleteResult.affectedRows === 0) {
        return res.status(400).send('Impossibile rimuovere il prodotto. Il prodotto potrebbe non essere presente nel carrello.');
      }

      return res.status(200).json({ message: 'Prodotto rimosso con successo dal carrello.' });
    }
  } catch (error) {
    console.error('Errore durante l\'operazione sul carrello:', error);
    res.status(500).send('Errore del server.');
  }
});



// Endpoint per ricevere le liste dei prodotti nei carrelli e la somma dei loro prezzi
app.get('/listaCarrello/:id', async (req, res) => {
  const id = req.params.id; // Ottieni l'ID dai parametri della route

  try {
    const rows = await db.query(
    'SELECT p.id AS product_id, p.name AS name_product, p.description AS description_product, '   +
    'p.price AS unit_price, ce.quantity, (p.price * ce.quantity) AS total_product '   +
    // '(SELECT SUM(p.price * ce_inner.quantity) ' +
    'FROM carts_products ce '  +
    'JOIN products p ON ce.products_id = p.id '   +
    `WHERE ce.carts_id = ${id}`);

      console.log("LISTACARS: " + JSON.stringify(rows));
  const totalCartPrice = rows.reduce((total, item) => {
  // Converti total_product in numero e somma al totale
  return total + parseFloat(item.total_product);
  }, 0);

  rows.push({totalPrice:  totalCartPrice});

    res.json(rows);
  } catch (error) {
    console.error('Errore durante l\'esecuzione della query:', error);
    res.status(500).send('Errore del server');
  }
});




app.post('/cart/apply-discount', async (req, res) => {

const { cartId, discountCode } = req.body;

  // Controllo dei parametri
  if (!cartId || !discountCode) {
    return res.status(400).send('Cart ID e Discount Code sono obbligatori.');
  }

  try {
    // Recupera il totale del carrello
    const cartTotalResult = await db.query(`
    SELECT SUM(p.price * cp.quantity) AS total_cart_price
    FROM carts_products cp
    JOIN products p
    ON cp.products_id = p.id
    WHERE cp.carts_id = ?;
    `, [cartId]);

    console.log("test" + JSON.stringify(cartTotalResult))

    const cartTotal = cartTotalResult[0].total_cart_price;
    if (!cartTotal) {
      return res.status(404).send('Il carrello è vuoto o non esiste.');
    }

    // Recupera i dettagli dello sconto
    const discountResult = await db.query(`
      SELECT type, amount
      FROM discounts
      WHERE code = ?
    `, [discountCode]);

    if (discountResult.length === 0) {
      return res.status(404).send('Codice sconto non valido o scaduto.');
    }

    const { type, amount } = discountResult[0];
    let discountedTotal;

    // Calcola il nuovo totale del carrello
    if (type === 'percentage') {
      discountedTotal = cartTotal - (cartTotal * amount / 100);
    } else if (type === 'fixed') {
      discountedTotal = cartTotal - amount;
    }

    // Il totale scontato non può essere negativo
    discountedTotal = Math.max(discountedTotal, 0);

    res.status(200).json({
      original_total: cartTotal,
      discounted_total: discountedTotal,
      message: 'Sconto applicato con successo.'
    });
  } catch (error) {
    console.error('Errore durante l\'applicazione dello sconto:', error);
    res.status(500).send('Errore del server.');
  }
});


// Endpoint per rimuovere un prodotto dal carrello
/*app.post('/discount', async (req, res) => {





  const { discountCode, cartId } = req.body;

    // Verifica che tutti i campi richiesti siano forniti
  if ( !discountCode || !cartId) {
    return res.status(400).send('All fields (discountCode, cartId) are necessary');
  }

  try {

  const query = 
  `SELECT 
    SUM(p.price * cp.quantity) AS total_cart_price
FROM 
    carts_products cp
JOIN 
    products p
ON 
    cp.products_id = p.id
WHERE 
    cp.carts_id = ?;`


  const [totalPrice] = await db.query(query, [cartId]);

     // Recupera i dettagli dello sconto
    const [discountResult] = await db.query(`
      SELECT type, amount
      FROM discounts
      WHERE code = ? `, [discountCode]);



    if (discountResult.length === 0) {
      return res.status(404).send('Codice sconto non valido.');
    }

    const { type, amount } = discountResult[0];
    let discountedTotal;

    // Calcola il nuovo totale del carrello
    if (type === 'percentage') {
      discountedTotal = totalPrice.total_cart_price - (totalPrice.total_cart_price * amount / 100);
    } else if (type === 'fixed') {
      discountedTotal = totalPrice.total_cart_price - amount;
    }

    // Il totale scontato non può essere negativo
    discountedTotal = Math.max(discountedTotal, 0);

    res.status(200).json({
      original_total: cartTotal,
      discounted_total: discountedTotal,
      message: 'Sconto applicato con successo.'
    });


} catch (error) {
    console.error('Errore durante l\'esecuzione della query:', error);
    res.status(500).send('Errore del server');
  }


});*/





app.listen(port, () => {
  console.log(`Server in ascolto su http://localhost:${port}`);
});

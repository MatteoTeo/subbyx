const request = require('supertest');
const express = require('express');


// Simula il database
const db = {
  query: jest.fn(),
};

// Configura l'app Express
const app = express();
app.use(express.json());

app.get('/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users');
    res.json(rows);
  } catch (error) {
    console.error('Errore durante l\'esecuzione della query:', error);
    res.status(500).send('Errore del server');
  }
});

app.get('/cart/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await db.query(`SELECT * FROM carts_products WHERE carts_id = ${id};`);
    res.json(rows);
  } catch (error) {
    console.error('Errore durante l\'esecuzione della query:', error);
    res.status(500).send('Errore del server');
  }
});

app.post('/product', async (req, res) => {
  const { name, description, price, quantity_available } = req.body;
  if (!name || !description || !price || !quantity_available) {
    return res.status(400).send('All fields (name, description, price, quantity_available) are necessary');
  }
  try {
    const query = `
      INSERT INTO products (name, description, price, quantity_available, date_registration) 
      VALUES (?, ?, ?, ?, NOW())
    `;
    const [result] = await db.query(query, [name, description, price, quantity_available]);
    res.status(201).json({ message: 'Prodotto aggiunto con successo', productId: result.insertId });
  } catch (error) {
    res.status(500).send('Errore del server');
  }
});

app.post('/cart/remove', async (req, res) => {
  const { productId, quantity } = req.body;

  if (!productId) {
    return res.status(400).send('È richiesto il parametro productId.');
  }

  try {
    if (quantity) {
      const updateQuery = `
        UPDATE carts_products 
        SET quantity = quantity - ? 
        WHERE products_id = ? AND quantity >= ?
      `;
      const [updateResult] = await db.query(updateQuery, [quantity, productId, quantity]);

      if (updateResult.affectedRows === 0) {
        return res.status(400).send('Impossibile ridurre la quantità. Il prodotto potrebbe non essere presente nel carrello o la quantità è insufficiente.');
      }

      const deleteQuery = `
        DELETE FROM carts_products 
        WHERE products_id = ? AND quantity <= 0
      `;
      await db.query(deleteQuery, [productId]);

      return res.status(200).json({ message: 'Quantità del prodotto aggiornata con successo.' });
    } else {
      const deleteQuery = `
        DELETE FROM carts_products 
        WHERE products_id = ?
      `;
      const [deleteResult] = await db.query(deleteQuery, [productId]);

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

// Endpoint GET /listaCarrello/:id
app.get('/listaCarrello/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await db.query(
      'SELECT p.id AS product_id, p.name AS name_product, p.description AS description_product, ' +
      'p.price AS unit_price, ce.quantity, (p.price * ce.quantity) AS total_product ' +
      'FROM carts_products ce ' +
      'JOIN products p ON ce.products_id = p.id ' +
      `WHERE ce.carts_id = ${id}`
    );

    const totalCartPrice = rows.reduce((total, item) => total + parseFloat(item.total_product), 0);
    rows.push({ totalPrice: totalCartPrice });

    res.json(rows);
  } catch (error) {
    console.error('Errore durante l\'esecuzione della query:', error);
    res.status(500).send('Errore del server');
  }
});

// Endpoint POST /cart/apply-discount
app.post('/cart/apply-discount', async (req, res) => {
  const { cartId, discountCode } = req.body;

  if (!cartId || !discountCode) {
    return res.status(400).send('Cart ID e Discount Code sono obbligatori.');
  }

  try {
    const cartTotalResult = await db.query(
      `SELECT SUM(p.price * cp.quantity) AS total_cart_price
       FROM carts_products cp
       JOIN products p ON cp.products_id = p.id
       WHERE cp.carts_id = ?;`,
      [cartId]
    );

    const cartTotal = cartTotalResult[0].total_cart_price;
    if (!cartTotal) {
      return res.status(404).send('Il carrello è vuoto o non esiste.');
    }

    const discountResult = await db.query(
      `SELECT type, amount FROM discounts WHERE code = ?;`,
      [discountCode]
    );

    if (discountResult.length === 0) {
      return res.status(404).send('Codice sconto non valido o scaduto.');
    }

    const { type, amount } = discountResult[0];
    let discountedTotal = type === 'percentage'
      ? cartTotal - (cartTotal * amount / 100)
      : cartTotal - amount;

    discountedTotal = Math.max(discountedTotal, 0);

    res.status(200).json({
      original_total: cartTotal,
      discounted_total: discountedTotal,
      message: 'Sconto applicato con successo.',
    });
  } catch (error) {
    console.error('Errore durante l\'applicazione dello sconto:', error);
    res.status(500).send('Errore del server.');
  }
});

// Endpoint POST /cart/apply-discount
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
});


describe('API Endpoints', () => {
  beforeEach(() => {
    db.query.mockReset();
  });

describe('GET /users', () => {
  // afterEach(() => {
  //   jest.clearAllMocks(); // Ripulisce i mock dopo ogni test
  // });

  it('dovrebbe restituire la lista degli utenti', async () => {
    // Mock dei dati di esempio restituiti dalla query
    const mockData = [
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Doe', email: 'jane@example.com' },
    ];
    db.query.mockResolvedValueOnce([mockData]);

    const response = await request(app).get('/users');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockData);
    expect(db.query).toHaveBeenCalledWith('SELECT * FROM users');
  });

  it('dovrebbe restituire un errore 500 in caso di errore del database', async () => {
    // Simula un errore durante l'esecuzione della query
    db.query.mockRejectedValueOnce(new Error('Errore del database'));

    const response = await request(app).get('/users');

    expect(response.status).toBe(500);
    expect(response.text).toBe('Errore del server');
    expect(db.query).toHaveBeenCalledWith('SELECT * FROM users');
  });
  });

describe('GET /cart/:id', () => {
    it('should return the products of a cart', async () => {
      const mockCartProducts = [{ product_id: 1, quantity: 2 }];
      db.query.mockResolvedValue([mockCartProducts]);

      const response = await request(app).get('/cart/1');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCartProducts);
      expect(db.query).toHaveBeenCalledWith('SELECT * FROM carts_products WHERE carts_id = 1;');
    });

    it('should return 500 if the database query fails', async () => {
      db.query.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/cart/1');
      expect(response.status).toBe(500);
      expect(response.text).toBe('Errore del server');
    });
  });


describe('POST /product', () => {
  // beforeEach(() => {
  //   db.query.mockReset();
  // });

  it('should return 400 if required fields are missing', async () => {
    const response = await request(app).post('/product').send({
      name: 'Test Product',
      price: 100,
    });
    expect(response.status).toBe(400);
    expect(response.text).toBe('All fields (name, description, price, quantity_available) are necessary');
  });

  it('should return 201 and the product ID if input is valid', async () => {
    const mockInsertResult = { insertId: 1 };
    db.query.mockResolvedValue([mockInsertResult]);

    const response = await request(app).post('/product').send({
      name: 'Test Product',
      description: 'This is a test product',
      price: 100,
      quantity_available: 10,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      message: 'Prodotto aggiunto con successo',
      productId: 1,
    });
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      'Test Product',
      'This is a test product',
      100,
      10,
    ]);
  });

  it('should return 500 if the database query fails', async () => {
    db.query.mockRejectedValue(new Error('Database error'));

    const response = await request(app).post('/product').send({
      name: 'Test Product',
      description: 'This is a test product',
      price: 100,
      quantity_available: 10,
    });

    expect(response.status).toBe(500);
    expect(response.text).toBe('Errore del server');
  });
  });

describe('POST /cart/remove', () => {

  it('should return 400 if productId is missing', async () => {
    const response = await request(app).post('/cart/remove').send({});
    expect(response.status).toBe(400);
    expect(response.text).toBe('È richiesto il parametro productId.');
  });

  it('should reduce product quantity successfully', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // Update query mock
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // Delete query mock

    const response = await request(app)
      .post('/cart/remove')
      .send({ productId: 1, quantity: 2 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Quantità del prodotto aggiornata con successo.' });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [2, 1, 2]); // Update query
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [1]); // Delete query
  });

  it('should return 400 if quantity reduction is invalid', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]); // Update query mock

    const response = await request(app)
      .post('/cart/remove')
      .send({ productId: 1, quantity: 2 });

    expect(response.status).toBe(400);
    expect(response.text).toBe('Impossibile ridurre la quantità. Il prodotto potrebbe non essere presente nel carrello o la quantità è insufficiente.');
  });

  it('should remove product completely if quantity is not provided', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // Delete query mock

    const response = await request(app)
      .post('/cart/remove')
      .send({ productId: 1 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Prodotto rimosso con successo dal carrello.' });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [1]); // Delete query
  });

  it('should return 400 if product is not present in cart for complete removal', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]); // Delete query mock

    const response = await request(app)
      .post('/cart/remove')
      .send({ productId: 1 });

    expect(response.status).toBe(400);
    expect(response.text).toBe('Impossibile rimuovere il prodotto. Il prodotto potrebbe non essere presente nel carrello.');
  });

  it('should return 500 on database error', async () => {
    db.query.mockRejectedValue(new Error('Database error')); // Simula errore

    const response = await request(app)
      .post('/cart/remove')
      .send({ productId: 1 });

    expect(response.status).toBe(500);
    expect(response.text).toBe('Errore del server.');
  });
  });

describe('GET /listaCarrello/:id', () => {
    it('should return the cart list with total price', async () => {
      db.query.mockResolvedValueOnce([
        [
          { total_product: '50.00' },
          { total_product: '30.00' },
        ]
      ]);

      const response = await request(app).get('/listaCarrello/1');
      expect(response.status).toBe(200);
      expect(response.body).toContainEqual({ totalPrice: 80 });
    });

    it('should handle database errors', async () => {
      db.query.mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app).get('/listaCarrello/1');
      expect(response.status).toBe(500);
      expect(response.text).toBe('Errore del server');
    });
  });

describe('POST /cart/apply-discount', () => {
    it('should apply a percentage discount successfully', async () => {
      db.query
        .mockResolvedValueOnce([{ total_cart_price: 100 }]) // Cart total
        .mockResolvedValueOnce([{ type: 'percentage', amount: 20 }]); // Discount details

      const response = await request(app)
        .post('/cart/apply-discount')
        .send({ cartId: 1, discountCode: 'DISCOUNT20' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        original_total: 100,
        discounted_total: 80,
        message: 'Sconto applicato con successo.',
      });
    });

    it('should apply a fixed discount successfully', async () => {
      db.query
        .mockResolvedValueOnce([{ total_cart_price: 100 }]) // Cart total
        .mockResolvedValueOnce([{ type: 'fixed', amount: 25 }]); // Discount details

      const response = await request(app)
        .post('/cart/apply-discount')
        .send({ cartId: 1, discountCode: 'DISCOUNT25' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        original_total: 100,
        discounted_total: 75,
        message: 'Sconto applicato con successo.',
      });
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app).post('/cart/apply-discount').send({ cartId: 1 });
      expect(response.status).toBe(400);
      expect(response.text).toBe('Cart ID e Discount Code sono obbligatori.');
    });

    it('should return 404 for invalid discount code', async () => {
      db.query
        .mockResolvedValueOnce([{ total_cart_price: 100 }]) // Cart total
        .mockResolvedValueOnce([]); // No discount details

      const response = await request(app)
        .post('/cart/apply-discount')
        .send({ cartId: 1, discountCode: 'INVALID' });

      expect(response.status).toBe(404);
      expect(response.text).toBe('Codice sconto non valido o scaduto.');
    });

    it('should handle database errors', async () => {
      db.query.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/cart/apply-discount')
        .send({ cartId: 1, discountCode: 'DISCOUNT20' });

      expect(response.status).toBe(500);
      expect(response.text).toBe('Errore del server.');
    });
  });

describe('POST /productToCart', () => {

  it('should return 400 if required fields are missing', async () => {
    const response = await request(app).post('/productToCart').send({
      cartId: 1,
      productQuantity: 5, // Manca productId
    });

    expect(response.status).toBe(400);
    expect(response.text).toBe('All fields (idProduct, quantity) are necessary');
  });

  it('should add a product to the cart if it does not exist', async () => {
    db.query.mockResolvedValueOnce([]); // Simula che il prodotto non esista
    db.query.mockResolvedValueOnce({ affectedRows: 1 }); // Simula il risultato di INSERT

    const response = await request(app).post('/productToCart').send({
      cartId: 1,
      productId: 101,
      productQuantity: 5,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ message: 'Prodotto aggiunto al carrello con successo' });
    expect(db.query).toHaveBeenCalledWith(
      'SELECT quantity FROM carts_products WHERE carts_id = ? AND products_id = ?',
      [1, 101]
    );
    expect(db.query).toHaveBeenCalledWith(
      'INSERT INTO carts_products (carts_id, products_id, quantity) VALUES (?, ?, ?)',
      [1, 101, 5]
    );
  });

  it('should update the quantity of an existing product in the cart', async () => {
    db.query.mockResolvedValueOnce([{ quantity: 3 }]); // Simula che il prodotto esista
    db.query.mockResolvedValueOnce({ affectedRows: 1 }); // Simula il risultato di UPDATE

    const response = await request(app).post('/productToCart').send({
      cartId: 1,
      productId: 101,
      productQuantity: 5,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      message: 'Prodotto già esistente nel carrello, quantità aggiornata con successo',
    });
    expect(db.query).toHaveBeenCalledWith(
      'SELECT quantity FROM carts_products WHERE carts_id = ? AND products_id = ?',
      [1, 101]
    );
    expect(db.query).toHaveBeenCalledWith(
      'UPDATE carts_products SET quantity = quantity + ? WHERE carts_id = ? AND products_id = ?',
      [5, 1, 101]
    );
  });

  it('should return 500 if there is a database error', async () => {
    db.query.mockRejectedValueOnce(new Error('Database error')); // Simula un errore del database

    const response = await request(app).post('/productToCart').send({
      cartId: 1,
      productId: 101,
      productQuantity: 5,
    });

    expect(response.status).toBe(500);
    expect(response.text).toBe('Errore del server');
    expect(db.query).toHaveBeenCalledWith(
      'SELECT quantity FROM carts_products WHERE carts_id = ? AND products_id = ?',
      [1, 101]
    );
  });
});
});

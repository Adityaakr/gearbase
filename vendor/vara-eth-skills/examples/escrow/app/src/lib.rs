#![no_std]

use sails_rs::{cell::RefCell, prelude::*};

const STATUS_CREATED: u32 = 1;
const STATUS_RELEASED: u32 = 2;
const STATUS_REFUNDED: u32 = 3;
const STATUS_CANCELLED: u32 = 4;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Order {
    buyer: ActorId,
    seller: ActorId,
    amount: u128,
    status: u32,
}

pub struct OrderState {
    orders: collections::HashMap<u128, Order>,
    next_order_id: u128,
}

impl OrderState {
    fn new() -> Self {
        Self {
            orders: collections::HashMap::new(),
            next_order_id: 1,
        }
    }

    fn get_order(&self, order_id: u128) -> Result<&Order, String> {
        self.orders
            .get(&order_id)
            .ok_or_else(|| "order does not exist".into())
    }

    fn get_order_mut(&mut self, order_id: u128) -> Result<&mut Order, String> {
        self.orders
            .get_mut(&order_id)
            .ok_or_else(|| "order does not exist".into())
    }
}

#[event]
#[derive(Clone, Debug, PartialEq, Eq, Encode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub enum OrderEvents {
    Created(u128, [u8; 32], [u8; 32], u128),
    Released(u128),
    Refunded(u128),
    Cancelled(u128),
}

pub struct OrdersService<'a> {
    state: &'a RefCell<OrderState>,
}

impl<'a> OrdersService<'a> {
    pub fn new(state: &'a RefCell<OrderState>) -> Self {
        Self { state }
    }
}

#[service(events = OrderEvents)]
impl OrdersService<'_> {
    #[export(unwrap_result)]
    pub fn create_order(
        &mut self,
        buyer: ActorId,
        seller: ActorId,
        amount: u128,
    ) -> Result<u128, String> {
        if buyer == seller {
            return Err("buyer and seller must be different".into());
        }

        if amount == 0 {
            return Err("amount must be greater than zero".into());
        }

        let mut state = self.state.borrow_mut();
        let order_id = state.next_order_id;
        state.next_order_id += 1;

        state.orders.insert(
            order_id,
            Order {
                buyer,
                seller,
                amount,
                status: STATUS_CREATED,
            },
        );

        self.emit_event(OrderEvents::Created(
            order_id,
            buyer.into_bytes(),
            seller.into_bytes(),
            amount,
        ))
        .expect("failed to emit order created event");

        Ok(order_id)
    }

    #[export(unwrap_result)]
    pub fn release_order(&mut self, order_id: u128) -> Result<(), String> {
        let mut state = self.state.borrow_mut();
        let order = state.get_order_mut(order_id)?;

        if order.status != STATUS_CREATED {
            return Err("order is not releasable".into());
        }

        order.status = STATUS_RELEASED;

        self.emit_event(OrderEvents::Released(order_id))
            .expect("failed to emit order released event");

        Ok(())
    }

    #[export(unwrap_result)]
    pub fn refund_order(&mut self, order_id: u128) -> Result<(), String> {
        let mut state = self.state.borrow_mut();
        let order = state.get_order_mut(order_id)?;

        if order.status != STATUS_CREATED {
            return Err("order is not refundable".into());
        }

        order.status = STATUS_REFUNDED;

        self.emit_event(OrderEvents::Refunded(order_id))
            .expect("failed to emit order refunded event");

        Ok(())
    }

    #[export(unwrap_result)]
    pub fn cancel_order(&mut self, order_id: u128) -> Result<(), String> {
        let mut state = self.state.borrow_mut();
        let order = state.get_order_mut(order_id)?;

        if order.status != STATUS_CREATED {
            return Err("order is not cancellable".into());
        }

        order.status = STATUS_CANCELLED;

        self.emit_event(OrderEvents::Cancelled(order_id))
            .expect("failed to emit order cancelled event");

        Ok(())
    }

    #[export(unwrap_result)]
    pub fn buyer_of(&self, order_id: u128) -> Result<ActorId, String> {
        Ok(self.state.borrow().get_order(order_id)?.buyer)
    }

    #[export(unwrap_result)]
    pub fn seller_of(&self, order_id: u128) -> Result<ActorId, String> {
        Ok(self.state.borrow().get_order(order_id)?.seller)
    }

    #[export(unwrap_result)]
    pub fn amount_of(&self, order_id: u128) -> Result<u128, String> {
        Ok(self.state.borrow().get_order(order_id)?.amount)
    }

    #[export(unwrap_result)]
    pub fn status_of(&self, order_id: u128) -> Result<u32, String> {
        Ok(self.state.borrow().get_order(order_id)?.status)
    }
}

pub struct Program {
    state: RefCell<OrderState>,
}

#[program]
impl Program {
    pub fn create() -> Self {
        Self {
            state: RefCell::new(OrderState::new()),
        }
    }

    pub fn orders(&self) -> OrdersService<'_> {
        OrdersService::new(&self.state)
    }
}

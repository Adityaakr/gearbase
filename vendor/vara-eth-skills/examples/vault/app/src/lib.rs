#![no_std]

use sails_rs::{cell::RefCell, prelude::*};

pub struct VaultState {
    balances: collections::HashMap<ActorId, u128>,
    total_balance: u128,
    admin: ActorId,
    paused: bool,
}

impl VaultState {
    fn new(admin: ActorId) -> Self {
        Self {
            balances: collections::HashMap::new(),
            total_balance: 0,
            admin,
            paused: false,
        }
    }
}

fn ensure_admin(state: &VaultState, caller: ActorId) -> Result<(), String> {
    if state.admin != caller {
        return Err("caller is not admin".into());
    }

    Ok(())
}

fn ensure_not_paused(state: &VaultState) -> Result<(), String> {
    if state.paused {
        return Err("vault is paused".into());
    }

    Ok(())
}

#[event]
#[derive(Clone, Debug, PartialEq, Eq, Encode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub enum VaultEvents {
    Deposited([u8; 32], u128, u128),
    Withdrawn([u8; 32], u128, u128),
}

#[event]
#[derive(Clone, Debug, PartialEq, Eq, Encode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub enum AdminEvents {
    Paused([u8; 32]),
    Unpaused([u8; 32]),
}

pub struct VaultService<'a> {
    state: &'a RefCell<VaultState>,
}

impl<'a> VaultService<'a> {
    pub fn new(state: &'a RefCell<VaultState>) -> Self {
        Self { state }
    }
}

#[service(events = VaultEvents)]
impl VaultService<'_> {
    #[export(payable, unwrap_result)]
    pub fn deposit(&mut self) -> Result<u128, String> {
        let caller = Syscall::message_source();
        let value = Syscall::message_value();
        {
            let state = self.state.borrow();
            ensure_not_paused(&state)?;
        }

        let mut state = self.state.borrow_mut();
        let new_balance = {
            let balance = state.balances.entry(caller).or_insert(0);
            *balance += value;
            *balance
        };
        state.total_balance += value;

        self.emit_event(VaultEvents::Deposited(caller.into_bytes(), value, new_balance))
            .expect("failed to emit deposit event");

        Ok(new_balance)
    }

    #[export(unwrap_result)]
    pub fn withdraw(&mut self, amount: u128) -> Result<CommandReply<()>, String> {
        if amount == 0 {
            return Err("withdraw amount must be greater than zero".into());
        }

        let caller = Syscall::message_source();

        {
            let state = self.state.borrow();
            ensure_not_paused(&state)?;
        }

        let mut state = self.state.borrow_mut();
        let remaining_balance = {
            let balance = state
                .balances
                .get_mut(&caller)
                .ok_or_else(|| "caller has no deposited balance".to_string())?;
            if *balance < amount {
                return Err("insufficient deposited balance".into());
            }
            *balance -= amount;
            *balance
        };
        state.total_balance -= amount;

        self.emit_event(VaultEvents::Withdrawn(caller.into_bytes(), amount, remaining_balance))
            .expect("failed to emit withdraw event");

        Ok(CommandReply::new(()).with_value(amount))
    }

    #[export(unwrap_result)]
    pub fn balance_of(&self, account: ActorId) -> Result<u128, String> {
        Ok(self
            .state
            .borrow()
            .balances
            .get(&account)
            .copied()
            .unwrap_or_default())
    }

    #[export(unwrap_result)]
    pub fn total_balance(&self) -> Result<u128, String> {
        Ok(self.state.borrow().total_balance)
    }
}

pub struct AdminService<'a> {
    state: &'a RefCell<VaultState>,
}

impl<'a> AdminService<'a> {
    pub fn new(state: &'a RefCell<VaultState>) -> Self {
        Self { state }
    }
}

#[service(events = AdminEvents)]
impl AdminService<'_> {
    #[export(unwrap_result)]
    pub fn owner(&self) -> Result<ActorId, String> {
        Ok(self.state.borrow().admin)
    }

    #[export(unwrap_result)]
    pub fn is_paused(&self) -> Result<bool, String> {
        Ok(self.state.borrow().paused)
    }

    #[export(unwrap_result)]
    pub fn pause(&mut self) -> Result<(), String> {
        let caller = Syscall::message_source();
        let mut state = self.state.borrow_mut();

        ensure_admin(&state, caller)?;

        if state.paused {
            return Err("vault is already paused".into());
        }

        state.paused = true;

        self.emit_event(AdminEvents::Paused(caller.into_bytes()))
            .expect("failed to emit pause event");

        Ok(())
    }

    #[export(unwrap_result)]
    pub fn unpause(&mut self) -> Result<(), String> {
        let caller = Syscall::message_source();
        let mut state = self.state.borrow_mut();

        ensure_admin(&state, caller)?;

        if !state.paused {
            return Err("vault is not paused".into());
        }

        state.paused = false;

        self.emit_event(AdminEvents::Unpaused(caller.into_bytes()))
            .expect("failed to emit unpause event");

        Ok(())
    }
}

pub struct Program {
    state: RefCell<VaultState>,
}

#[program]
impl Program {
    pub fn create() -> Self {
        Self {
            state: RefCell::new(VaultState::new(Syscall::message_source())),
        }
    }

    pub fn vault(&self) -> VaultService<'_> {
        VaultService::new(&self.state)
    }

    pub fn admin(&self) -> AdminService<'_> {
        AdminService::new(&self.state)
    }
}

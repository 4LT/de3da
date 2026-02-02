use std::error;
use std::fmt;
use fmt::{Formatter, Display};

#[derive(Debug)]
pub struct AppError(pub String);

impl AppError {
    #[allow(dead_code)]
    pub fn new<E: error::Error>(error: E) -> AppError {
        AppError(format!("{}", error))
    }
}

impl Display for AppError {
    fn fmt(&self, formatter: &mut Formatter) -> Result<(), fmt::Error> {
        write!(formatter, "{}", self.0)?;
        Ok(())
    }
}

impl error::Error for AppError {
}


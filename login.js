(() => {
  const accounts={ced:{password:'ced123',profile:'ced'},mazzolari:{password:'scuola123',profile:'school'},comune:{password:'comune123',profile:'town'}};
  const form=document.querySelector('#loginForm'), error=document.querySelector('#loginError');
  function login(){if(!form.reportValidity())return;const username=form.elements.username.value.trim().toLowerCase(),account=Object.hasOwn(accounts,username)?accounts[username]:null;if(!account || form.elements.password.value!==account.password){error.textContent='Nome utente o password non corretti.';return;}try{sessionStorage.setItem('auditorium-demo-profile',account.profile);}catch(_){error.textContent='Il browser non permette di salvare la sessione. Abilita l’archiviazione e riprova.';return;}form.elements.password.value='';location.href='calendario.html';}
  document.querySelector('#loginButton').addEventListener('click',login);form.addEventListener('submit',event=>{event.preventDefault();login();});
})();
